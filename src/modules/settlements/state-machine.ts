import type { SettlementStatus, SettlementOrder } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { postJournalEntry } from '../ledger/postings.js'

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid transition: ${from} → ${to}`)
    this.name = 'InvalidTransitionError'
  }
}

export class ConcurrentModificationError extends Error {
  constructor() {
    super('Concurrent modification detected — please retry')
    this.name = 'ConcurrentModificationError'
  }
}

// Allowed state transitions
const TRANSITIONS: Record<SettlementStatus, SettlementStatus[]> = {
  DRAFT:           ['AWAITING_FUNDS', 'CANCELLED'],
  AWAITING_FUNDS:  ['FUNDED', 'EXPIRED', 'CANCELLED'],
  FUNDED:          ['MINTING', 'REFUND_PENDING'],
  MINTING:         ['MINTED', 'MINT_FAILED'],
  MINTED:          ['IN_TRANSIT'],
  IN_TRANSIT:      ['ARRIVED', 'TRANSFER_FAILED'],
  ARRIVED:         ['REDEEMING'],
  REDEEMING:       ['REDEEMED', 'REDEEM_FAILED'],
  REDEEMED:        ['PAYING_OUT'],
  PAYING_OUT:      ['PAID_OUT', 'PAYOUT_FAILED'],
  PAID_OUT:        ['RECONCILED'],
  RECONCILED:      [],
  EXPIRED:         ['REFUND_PENDING'],
  CANCELLED:       [],
  MINT_FAILED:     ['MINTING', 'MANUAL_REVIEW'],
  TRANSFER_FAILED: ['IN_TRANSIT', 'MANUAL_REVIEW'],
  REDEEM_FAILED:   ['REDEEMING', 'MANUAL_REVIEW'],
  PAYOUT_FAILED:   ['PAYING_OUT', 'MANUAL_REVIEW'],
  REFUND_PENDING:  ['REFUNDED'],
  REFUNDED:        [],
  MANUAL_REVIEW:   ['REFUND_PENDING', 'MINTING', 'IN_TRANSIT', 'REDEEMING', 'PAYING_OUT'],
}

export interface TransitionOpts {
  trigger: string
  actor: string
  payload?: object
  reason?: string
}

export async function transition(
  orderId: string,
  toStatus: SettlementStatus,
  opts: TransitionOpts,
): Promise<SettlementOrder> {
  return _transition(orderId, toStatus, opts, false)
}

async function _transition(
  orderId: string,
  toStatus: SettlementStatus,
  opts: TransitionOpts,
  isRetry: boolean,
): Promise<SettlementOrder> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.settlementOrder.findUniqueOrThrow({ where: { id: orderId } })
    const fromStatus = order.status as SettlementStatus

    if (!TRANSITIONS[fromStatus]?.includes(toStatus)) {
      throw new InvalidTransitionError(fromStatus, toStatus)
    }

    // Optimistic lock: update only if version still matches
    const updated = await tx.settlementOrder.updateMany({
      where: { id: orderId, version: order.version },
      data: { status: toStatus, version: order.version + 1, statusReason: opts.reason ?? null },
    })

    if (updated.count === 0) {
      if (isRetry) throw new ConcurrentModificationError()
      // Retry once
      return _transition(orderId, toStatus, opts, true)
    }

    await tx.orderEvent.create({
      data: {
        orderId,
        fromStatus,
        toStatus,
        trigger: opts.trigger,
        payloadJson: opts.payload ?? {},
        actor: opts.actor,
      },
    })

    await postJournalEntry(tx, order, fromStatus, toStatus)

    return tx.settlementOrder.findUniqueOrThrow({ where: { id: orderId } })
  })
}
