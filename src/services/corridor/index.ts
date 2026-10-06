/**
 * Cross-border corridor service
 *
 * Inbound remittance routing for the top corridors into Indonesia:
 *   Saudi Arabia (SAR), Malaysia (MYR), UAE (AED), Singapore (SGD), US (USD)
 *
 * Flow:
 *   1. Partner abroad sends source-currency wire to Pintas corridor account
 *   2. Pintas quotes IDR at FX rate + spread
 *   3. On receipt confirmation, disburses IDR directly via DurianPay to recipient
 */

import { Decimal } from 'decimal.js'
import { prisma } from '../../db/client.js'
import { getFxRate } from './fx-provider.js'
import { disburseToBankAccount, disburseToEwallet } from '../disbursement/index.js'
import { dispatchWebhookEvent } from '../webhook/delivery.js'
import { submitTravelRule, travelRuleRequired } from '../travel-rule/index.js'
import type { CorridorQuote, RemittanceOrder, CreateRemittanceParams } from './types.js'

const CORRIDOR_SPREADS: Record<string, number> = {
  MY: 80,
  SA: 100,
  AE: 100,
  SG: 70,
  US: 120,
}

const CORRIDOR_FEES: Record<string, { amount: string; currency: string }> = {
  MY: { amount: '2.00', currency: 'MYR' },
  SA: { amount: '5.00', currency: 'SAR' },
  AE: { amount: '5.00', currency: 'AED' },
  SG: { amount: '2.00', currency: 'SGD' },
  US: { amount: '3.00', currency: 'USD' },
}

const CORRIDOR_LIMITS: Record<string, { minSource: string; maxSource: string }> = {
  MY: { minSource: '10', maxSource: '50000' },
  SA: { minSource: '20', maxSource: '50000' },
  AE: { minSource: '20', maxSource: '50000' },
  SG: { minSource: '5', maxSource: '50000' },
  US: { minSource: '5', maxSource: '25000' },
}

export async function quoteCorridor(params: {
  sourceCurrency: string
  amountSource: string
  corridorCode: string
}): Promise<CorridorQuote> {
  const { sourceCurrency, amountSource, corridorCode } = params
  const upper = corridorCode.toUpperCase()

  const spreadBps = CORRIDOR_SPREADS[upper] ?? 150
  const fee = CORRIDOR_FEES[upper] ?? { amount: '5.00', currency: sourceCurrency }
  const limits = CORRIDOR_LIMITS[upper] ?? { minSource: '10', maxSource: '10000' }

  const amount = new Decimal(amountSource)

  if (amount.lt(limits.minSource)) {
    throw new Error(`Minimum send amount is ${limits.minSource} ${sourceCurrency} for corridor ${upper}`)
  }
  if (amount.gt(limits.maxSource)) {
    throw new Error(`Maximum send amount is ${limits.maxSource} ${sourceCurrency} for corridor ${upper}`)
  }

  const fxRate = await getFxRate(sourceCurrency, 'IDR')
  const feeAmount = new Decimal(fee.amount)
  const netAmount = amount.minus(feeAmount)

  if (netAmount.lte(0)) {
    throw new Error('Amount is too small to cover fees')
  }

  const rawIdr = netAmount.mul(fxRate)
  const spreadMultiplier = new Decimal(1).minus(new Decimal(spreadBps).div(10000))
  const quotedIdr = rawIdr.mul(spreadMultiplier).toDecimalPlaces(0)

  return {
    corridorCode: upper,
    sourceCurrency,
    amountSource,
    feeSource: fee.amount,
    netAmountSource: netAmount.toFixed(2),
    fxRate: fxRate.toFixed(4),
    spreadBps,
    quotedAmountIdr: quotedIdr.toFixed(0),
    expiresAt: new Date(Date.now() + 5 * 60_000),
  }
}

export async function createRemittanceOrder(
  params: CreateRemittanceParams
): Promise<RemittanceOrder> {
  const quote = await quoteCorridor({
    sourceCurrency: params.sourceCurrency,
    amountSource: params.amountSource,
    corridorCode: params.corridorCode,
  })

  const remittance = await prisma.remittanceOrder.create({
    data: {
      customerId: params.customerId,
      corridorCode: params.corridorCode.toUpperCase(),
      sourceCurrency: params.sourceCurrency,
      amountSource: params.amountSource,
      feeSource: quote.feeSource,
      netAmountSource: quote.netAmountSource,
      fxRate: quote.fxRate,
      spreadBps: quote.spreadBps,
      quotedAmountIdr: quote.quotedAmountIdr,
      recipientName: params.recipientName,
      recipientBank: params.recipientBank ?? null,
      recipientAccountNumber: params.recipientAccountNumber ?? null,
      recipientEwallet: params.recipientEwallet ?? null,
      recipientPhone: params.recipientPhone ?? null,
      status: 'PENDING',
      expiresAt: quote.expiresAt,
    },
  })

  await dispatchWebhookEvent(params.customerId, 'remittance.created', {
    remittanceId: remittance.id,
    corridorCode: remittance.corridorCode,
    sourceCurrency: remittance.sourceCurrency,
    amountSource: remittance.amountSource,
    quotedAmountIdr: remittance.quotedAmountIdr,
  })

  return toRemittanceOrder(remittance)
}

export async function confirmRemittanceReceipt(
  remittanceId: string,
  receivedAmountSource: string,
  externalRef: string
): Promise<void> {
  const remittance = await prisma.remittanceOrder.findUniqueOrThrow({
    where: { id: remittanceId },
  })

  if (remittance.status !== 'PENDING') {
    throw new Error(`Remittance ${remittanceId} is not PENDING (status: ${remittance.status})`)
  }

  await prisma.remittanceOrder.update({
    where: { id: remittanceId },
    data: { status: 'FUNDED', externalRef },
  })

  await dispatchWebhookEvent(remittance.customerId, 'remittance.funded', {
    remittanceId,
    receivedAmountSource,
    quotedAmountIdr: remittance.quotedAmountIdr,
  })

  // Travel Rule — SEOJK 20/2024: submit VASP data for transfers > IDR 46M
  if (travelRuleRequired(remittance.quotedAmountIdr)) {
    await submitTravelRule({
      transferId: remittanceId,
      amountIdr: remittance.quotedAmountIdr,
      originator: {
        name: `Corridor sender (${remittance.corridorCode})`,
        country: remittance.corridorCode === 'MY' ? 'MY'
          : remittance.corridorCode === 'SA' ? 'SA'
          : remittance.corridorCode === 'AE' ? 'AE'
          : remittance.corridorCode === 'SG' ? 'SG'
          : 'US',
      },
      beneficiary: {
        name: remittance.recipientName,
        accountNumber: remittance.recipientAccountNumber ?? remittance.recipientPhone ?? undefined,
        country: 'ID',
      },
    })
  }

  // Disburse IDR to recipient directly via DurianPay
  try {
    await prisma.remittanceOrder.update({
      where: { id: remittanceId },
      data: { status: 'PROCESSING' },
    })

    let disbursementId: string

    if (remittance.recipientEwallet && remittance.recipientPhone) {
      const result = await disburseToEwallet({
        ewalletCode: remittance.recipientEwallet,
        phoneNumber: remittance.recipientPhone,
        amountIdr: remittance.quotedAmountIdr,
        referenceId: remittanceId,
        note: `Remittance ${remittance.corridorCode}→IDR`,
      })
      disbursementId = result.disbursementId
    } else if (remittance.recipientAccountNumber && remittance.recipientBank) {
      const result = await disburseToBankAccount({
        bankCode: remittance.recipientBank,
        accountNumber: remittance.recipientAccountNumber,
        accountName: remittance.recipientName,
        amountIdr: remittance.quotedAmountIdr,
        referenceId: remittanceId,
        note: `Remittance ${remittance.corridorCode}→IDR`,
      })
      disbursementId = result.disbursementId
    } else {
      throw new Error('No valid recipient configured')
    }

    await prisma.remittanceOrder.update({
      where: { id: remittanceId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })

    await dispatchWebhookEvent(remittance.customerId, 'remittance.completed', {
      remittanceId,
      disbursementId,
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown error'
    await prisma.remittanceOrder.update({
      where: { id: remittanceId },
      data: { status: 'FAILED', failedAt: new Date(), failReason: reason },
    })
    await dispatchWebhookEvent(remittance.customerId, 'remittance.failed', {
      remittanceId,
      reason,
    })
    throw err
  }
}

export async function getRemittanceOrder(
  remittanceId: string,
  customerId: string
): Promise<RemittanceOrder | null> {
  const r = await prisma.remittanceOrder.findFirst({
    where: { id: remittanceId, customerId },
  })
  return r ? toRemittanceOrder(r) : null
}

function toRemittanceOrder(r: {
  id: string
  status: string
  corridorCode: string
  sourceCurrency: string
  amountSource: string
  quotedAmountIdr: string
  expiresAt: Date
  createdAt: Date
}): RemittanceOrder {
  return {
    id: r.id,
    status: r.status,
    corridorCode: r.corridorCode,
    sourceCurrency: r.sourceCurrency,
    amountSource: r.amountSource,
    quotedAmountIdr: r.quotedAmountIdr,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  }
}
