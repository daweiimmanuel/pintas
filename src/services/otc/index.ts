import { Decimal } from 'decimal.js'
import { prisma } from '../../db/client.js'
import { getVwapRate } from '../exchange/aggregator.js'
import { sendStablecoin } from '../blockchain/index.js'
import { disburseToBankAccount } from '../disbursement/index.js'
import { dispatchWebhookEvent } from '../webhook/delivery.js'
import type { Stablecoin, Chain } from '../../types/index.js'

const MIN_IDR = new Decimal('75000000')   // IDR 75M minimum
const TIER3_IDR = new Decimal('500000000') // IDR 500M — requires TIER3 KYC
const DEFAULT_SPREAD_BPS = 30             // 30 bps OTC spread (tighter than retail)
const QUOTE_TTL_MS = 30_000               // 30-second quote lock

export interface OtcQuoteParams {
  customerId: string
  side: 'BUY' | 'SELL'               // BUY = client pays IDR, receives stablecoin
  stablecoin: Stablecoin
  chain: Chain
  amountIdr: string
  spreadBps?: number
  destinationAddress?: string         // for BUY orders
  bankCode?: string                   // for SELL orders
  accountNumber?: string
  accountName?: string
}

export async function quoteOtc(params: OtcQuoteParams) {
  const amountIdr = new Decimal(params.amountIdr)

  if (amountIdr.lt(MIN_IDR)) {
    throw Object.assign(
      new Error(`OTC minimum is IDR ${MIN_IDR.toFixed(0)}. Requested: IDR ${params.amountIdr}`),
      { statusCode: 400 }
    )
  }

  // Amounts ≥ IDR 500M require institutional KYC (Tier 3) per OJK KYB requirements
  if (amountIdr.gte(TIER3_IDR)) {
    const tier3Record = await prisma.kycRecord.findFirst({
      where: { customerId: params.customerId, tier: 'TIER3', status: 'APPROVED' },
    })
    if (!tier3Record) {
      throw Object.assign(
        new Error('Tier 3 KYC required for OTC orders ≥ IDR 500,000,000. Submit POST /v1/kyc/tier3.'),
        { statusCode: 403, code: 'KYC_TIER3_REQUIRED' }
      )
    }
  }

  const spreadBps = params.spreadBps ?? DEFAULT_SPREAD_BPS
  const vwap = await getVwapRate(params.stablecoin)

  // BUY: client pays IDR → receives stablecoin (ask side, spread added to rate)
  // SELL: client pays stablecoin → receives IDR (bid side, spread subtracted)
  const midRate = new Decimal(vwap.mid)
  const spreadMul = new Decimal(spreadBps).div(10000)
  const rate =
    params.side === 'BUY'
      ? midRate.mul(new Decimal(1).plus(spreadMul))    // client pays more IDR per stablecoin
      : midRate.mul(new Decimal(1).minus(spreadMul))   // client receives less IDR per stablecoin

  const amountStablecoin = amountIdr.div(rate).toDecimalPlaces(6)
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MS)

  const order = await prisma.otcOrder.create({
    data: {
      customerId: params.customerId,
      side: params.side,
      stablecoin: params.stablecoin,
      chain: params.chain,
      amountIdr: amountIdr.toDecimalPlaces(2),
      amountStablecoin,
      rate: rate.toDecimalPlaces(8),
      spreadBps,
      status: 'QUOTED',
      expiresAt,
      destinationAddress: params.destinationAddress ?? null,
      bankCode: params.bankCode ?? null,
      accountNumber: params.accountNumber ?? null,
      accountName: params.accountName ?? null,
    },
  })

  return {
    orderId: order.id,
    side: order.side,
    stablecoin: order.stablecoin,
    chain: order.chain,
    amountIdr: amountIdr.toFixed(0),
    amountStablecoin: amountStablecoin.toFixed(6),
    rate: rate.toFixed(8),
    spreadBps,
    expiresAt,
  }
}

export async function acceptOtc(orderId: string, customerId: string) {
  const order = await prisma.otcOrder.findUniqueOrThrow({ where: { id: orderId } })

  if (order.customerId !== customerId) {
    throw Object.assign(new Error('OTC order not found'), { statusCode: 404 })
  }
  if (order.status !== 'QUOTED') {
    throw Object.assign(new Error(`Cannot accept order in status ${order.status}`), { statusCode: 400 })
  }
  if (new Date() > order.expiresAt) {
    await prisma.otcOrder.update({ where: { id: orderId }, data: { status: 'EXPIRED' } })
    throw Object.assign(new Error('OTC quote has expired — request a new quote'), { statusCode: 400 })
  }

  const accepted = await prisma.otcOrder.update({
    where: { id: orderId },
    data: { status: 'ACCEPTED', acceptedAt: new Date() },
  })

  // Fire-and-forget execution
  executeOtc(orderId).catch((err: Error) =>
    console.error(`[otc] executeOtc ${orderId} failed:`, err.message)
  )

  await dispatchWebhookEvent(customerId, 'otc.accepted', { orderId }, { otcOrderId: orderId })

  return accepted
}

export async function executeOtc(orderId: string): Promise<void> {
  const order = await prisma.otcOrder.findUniqueOrThrow({ where: { id: orderId } })

  if (order.status !== 'ACCEPTED') return

  await prisma.otcOrder.update({ where: { id: orderId }, data: { status: 'EXECUTING' } })

  try {
    if (order.side === 'BUY') {
      // Client has paid IDR (verified off-band by OTC desk), we send stablecoin
      if (!order.destinationAddress) {
        throw new Error('BUY order missing destinationAddress')
      }
      const result = await sendStablecoin({
        chain: order.chain,
        stablecoin: order.stablecoin,
        to: order.destinationAddress,
        amount: order.amountStablecoin.toString(),
      })
      await prisma.otcOrder.update({
        where: { id: orderId },
        data: { status: 'SETTLED', settlementTxHash: result.txHash, settledAt: new Date() },
      })
      await dispatchWebhookEvent(order.customerId, 'otc.settled', {
        orderId,
        txHash: result.txHash,
        amountStablecoin: order.amountStablecoin.toString(),
      }, { otcOrderId: orderId })
    } else {
      // SELL: client sends stablecoin (deposited out-of-band), we disburse IDR
      if (!order.bankCode || !order.accountNumber || !order.accountName) {
        throw new Error('SELL order missing bank account details')
      }
      const result = await disburseToBankAccount({
        bankCode: order.bankCode,
        accountNumber: order.accountNumber,
        accountName: order.accountName,
        amountIdr: order.amountIdr.toString(),
        referenceId: orderId,
        note: `OTC SELL settlement ${orderId}`,
      })
      await prisma.otcOrder.update({
        where: { id: orderId },
        data: {
          status: 'SETTLED',
          counterpartyRef: result.disbursementId,
          settledAt: new Date(),
        },
      })
      await dispatchWebhookEvent(order.customerId, 'otc.settled', {
        orderId,
        disbursementId: result.disbursementId,
        amountIdr: order.amountIdr.toString(),
      }, { otcOrderId: orderId })
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown error'
    await prisma.otcOrder.update({
      where: { id: orderId },
      data: { status: 'FAILED', failReason: reason },
    })
    await dispatchWebhookEvent(order.customerId, 'otc.failed', { orderId, reason }, { otcOrderId: orderId })
    throw err
  }
}

export async function cancelOtc(orderId: string, customerId: string) {
  const order = await prisma.otcOrder.findUniqueOrThrow({ where: { id: orderId } })
  if (order.customerId !== customerId) {
    throw Object.assign(new Error('OTC order not found'), { statusCode: 404 })
  }
  if (!['QUOTED', 'ACCEPTED'].includes(order.status)) {
    throw Object.assign(
      new Error(`Cannot cancel order in status ${order.status}`),
      { statusCode: 400 }
    )
  }
  return prisma.otcOrder.update({
    where: { id: orderId },
    data: { status: 'CANCELLED' },
  })
}

export async function getOtcOrder(orderId: string, customerId: string) {
  return prisma.otcOrder.findFirst({ where: { id: orderId, customerId } })
}
