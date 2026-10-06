import type { SettlementStatus } from '@prisma/client'
import type { Prisma, SettlementOrder } from '@prisma/client'
import { assertBalanced, type LedgerLineInput } from './check.js'
import { centsToMicroUsdc } from '../../lib/money.js'

type TxClient = Omit<Prisma.TransactionClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

interface AnnotatedLine extends LedgerLineInput {
  account: string
}

async function resolveAccount(tx: TxClient, code: string): Promise<string> {
  const existing = await tx.ledgerAccount.findUnique({ where: { code } })
  if (existing) return existing.id
  const asset = code.includes('usdc') ? 'USDC' : 'USD'
  const type =
    code.startsWith('liability:') ? 'LIABILITY' :
    code.startsWith('revenue:')   ? 'REVENUE'   : 'ASSET'
  const created = await tx.ledgerAccount.upsert({
    where: { code },
    create: { code, asset, type },
    update: {},
  })
  return created.id
}

async function post(
  tx: TxClient,
  orderId: string,
  transition: string,
  description: string,
  lines: AnnotatedLine[],
): Promise<void> {
  assertBalanced(lines)
  const entry = await tx.journalEntry.create({
    data: { orderId, transition, description },
  })
  for (const line of lines) {
    const acctId = await resolveAccount(tx, line.account)
    await tx.ledgerLine.create({
      data: {
        journalEntryId: entry.id,
        ledgerAccountId: acctId,
        asset: line.asset,
        debitMinor:  line.debitMinor,
        creditMinor: line.creditMinor,
      },
    })
  }
}

// ─── Per-transition journal entries ──────────────────────────────────────────
//
// Flow: FUNDED → MINTING → MINTED → IN_TRANSIT → ARRIVED → REDEEMED → PAID_OUT
//
// Asset balances at completion:
//   asset:usd:collection        = +fee  (Pintas's fee, backed by revenue:usd:fees)
//   liability:usd:exporter_payable = 0  (cleared on PAID_OUT)
//   revenue:usd:fees            = +fee
//   conversion:usd              = 0     (cleared on REDEEMED)
//   conversion:usdc             = 0     (cleared on REDEEMED)
//   asset:usd:payout            = 0     (cleared on PAID_OUT)
//   asset:usdc:treasury         = 0
//   asset:usdc:in_transit       = 0

export async function postJournalEntry(
  tx: TxClient,
  order: SettlementOrder,
  _fromStatus: SettlementStatus,
  toStatus: SettlementStatus,
): Promise<void> {
  const inv  = order.invoiceAmountCents as bigint
  const fee  = order.feeCents as bigint
  const net  = order.netPayoutCents as bigint
  const netM = centsToMicroUsdc(net)

  switch (toStatus) {
    case 'FUNDED':
      // Buyer payment received; record collection asset, payable liability, fee revenue.
      // USD: DR collection +inv = CR exporter_payable +net + CR fees +fee
      return post(tx, order.id, toStatus, 'Invoice funded by buyer', [
        { account: 'asset:usd:collection',           asset: 'USD', debitMinor: inv,  creditMinor: 0n  },
        { account: 'liability:usd:exporter_payable', asset: 'USD', debitMinor: 0n,   creditMinor: net },
        { account: 'revenue:usd:fees',               asset: 'USD', debitMinor: 0n,   creditMinor: fee },
      ])

    case 'MINTING':
      // Net USD sent to ramp for minting; leaves collection into conversion.
      // USD: DR conversion:usd +net = CR collection +net
      return post(tx, order.id, toStatus, 'USD sent to ramp for minting', [
        { account: 'conversion:usd',        asset: 'USD', debitMinor: net, creditMinor: 0n  },
        { account: 'asset:usd:collection',  asset: 'USD', debitMinor: 0n,  creditMinor: net },
      ])

    case 'MINTED':
      // USDC created by ramp; arrives in treasury.
      // USDC: DR treasury +netM = CR conversion:usdc +netM
      return post(tx, order.id, toStatus, 'USDC minted from USD', [
        { account: 'asset:usdc:treasury', asset: 'USDC', debitMinor: netM, creditMinor: 0n   },
        { account: 'conversion:usdc',     asset: 'USDC', debitMinor: 0n,   creditMinor: netM },
      ])

    case 'IN_TRANSIT':
      // USDC sent on-chain; moves treasury → in_transit.
      // USDC: DR in_transit +netM = CR treasury +netM
      return post(tx, order.id, toStatus, 'USDC sent on-chain', [
        { account: 'asset:usdc:in_transit', asset: 'USDC', debitMinor: netM, creditMinor: 0n   },
        { account: 'asset:usdc:treasury',   asset: 'USDC', debitMinor: 0n,   creditMinor: netM },
      ])

    case 'ARRIVED':
      // USDC arrived at destination ramp; in_transit → treasury (at destination).
      // USDC: DR treasury +netM = CR in_transit +netM
      return post(tx, order.id, toStatus, 'USDC arrived at destination', [
        { account: 'asset:usdc:treasury',   asset: 'USDC', debitMinor: netM, creditMinor: 0n   },
        { account: 'asset:usdc:in_transit', asset: 'USDC', debitMinor: 0n,   creditMinor: netM },
      ])

    case 'REDEEMED':
      // USDC redeemed for USD; USD arrives in payout account.
      // USDC: DR conversion:usdc +netM = CR treasury +netM   (USDC consumed)
      // USD:  DR payout +net           = CR conversion:usd +net  (USD from conversion)
      return post(tx, order.id, toStatus, 'USDC redeemed to USD', [
        { account: 'conversion:usdc',     asset: 'USDC', debitMinor: netM, creditMinor: 0n   },
        { account: 'asset:usdc:treasury', asset: 'USDC', debitMinor: 0n,   creditMinor: netM },
        { account: 'asset:usd:payout',    asset: 'USD',  debitMinor: net,  creditMinor: 0n   },
        { account: 'conversion:usd',      asset: 'USD',  debitMinor: 0n,   creditMinor: net  },
      ])

    case 'PAID_OUT':
      // USD sent to exporter; clears payable, drains payout account.
      // USD: DR exporter_payable +net = CR payout +net
      return post(tx, order.id, toStatus, 'USD paid out to exporter', [
        { account: 'liability:usd:exporter_payable', asset: 'USD', debitMinor: net, creditMinor: 0n  },
        { account: 'asset:usd:payout',               asset: 'USD', debitMinor: 0n,  creditMinor: net },
      ])

    case 'REFUND_PENDING': {
      const funded = order.fundedAmountCents as bigint
      if (funded <= 0n) return
      // USD: DR collection +funded = CR refund_payable +funded
      // (reverse any fee revenue pro-rata only if funded < invoice; simplified: full refund)
      return post(tx, order.id, toStatus, 'Refund initiated', [
        { account: 'liability:usd:refund_payable', asset: 'USD', debitMinor: 0n,     creditMinor: funded },
        { account: 'asset:usd:collection',         asset: 'USD', debitMinor: funded, creditMinor: 0n     },
      ])
    }

    default:
      return
  }
}
