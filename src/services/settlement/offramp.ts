import Decimal from 'decimal.js'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { quoteOfframp } from '../exchange/aggregator.js'
import { disburseToBankAccount, disburseToEwallet } from '../disbursement/index.js'
import { getSettlementAddress } from '../blockchain/index.js'
import { dispatchWebhookEvent } from '../webhook/delivery.js'
import { DisbursementType } from '../../types/index.js'
import type { Chain, Stablecoin, OfframpQuote } from '../../types/index.js'

export interface CreateOfframpBankParams {
  customerId: string
  amountStablecoin: string
  stablecoin: Stablecoin
  chain: Chain
  bankCode: string
  accountNumber: string
  accountName: string
  referenceId?: string
  metadata?: Record<string, unknown>
  spreadBps?: number
}

export interface CreateOfframpEwalletParams {
  customerId: string
  amountStablecoin: string
  stablecoin: Stablecoin
  chain: Chain
  ewalletCode: string
  ewalletPhone: string
  referenceId?: string
  metadata?: Record<string, unknown>
  spreadBps?: number
}

export type CreateOfframpParams = CreateOfframpBankParams | CreateOfframpEwalletParams

function isEwallet(p: CreateOfframpParams): p is CreateOfframpEwalletParams {
  return 'ewalletCode' in p
}

export async function createOfframpOrder(
  params: CreateOfframpParams
): Promise<{ order: object; quote: OfframpQuote }> {
  const quote = await quoteOfframp({
    amountStablecoin: params.amountStablecoin,
    stablecoin: params.stablecoin,
    chain: params.chain,
    spreadBps: params.spreadBps,
  })

  const depositAddress = quote.depositAddress !== 'PENDING_CONFIG'
    ? quote.depositAddress
    : getSettlementAddress(params.chain, params.stablecoin)

  const orderData = {
    id: quote.orderId,
    customerId: params.customerId,
    amountStablecoin: new Decimal(params.amountStablecoin),
    stablecoin: params.stablecoin,
    chain: params.chain,
    quotedRate: new Decimal(quote.rate),
    quotedAmountIdr: new Decimal(quote.quotedAmountIdr),
    spreadBps: quote.spreadBps,
    quoteExpiresAt: quote.expiresAt,
    depositAddress,
    referenceId: params.referenceId,
    metadata: params.metadata as Prisma.InputJsonValue | undefined,
    ...(isEwallet(params)
      ? {
          disbursementType: DisbursementType.EWALLET,
          ewalletCode: params.ewalletCode,
          ewalletPhone: params.ewalletPhone,
        }
      : {
          disbursementType: DisbursementType.BANK_TRANSFER,
          bankCode: (params as CreateOfframpBankParams).bankCode,
          accountNumber: (params as CreateOfframpBankParams).accountNumber,
          accountName: (params as CreateOfframpBankParams).accountName,
        }),
  }

  const order = await prisma.offrampOrder.create({ data: orderData })

  await dispatchWebhookEvent(params.customerId, 'offramp.created', {
    orderId: order.id,
    depositAddress,
    amountStablecoin: params.amountStablecoin,
    stablecoin: params.stablecoin,
    chain: params.chain,
  }, { offrampOrderId: order.id })

  return { order, quote }
}

export async function handleOnchainDeposit(
  depositAddress: string,
  txHash: string,
  amountStablecoin: string
): Promise<void> {
  const order = await prisma.offrampOrder.findFirst({
    where: { depositAddress, status: 'PENDING' },
  })
  if (!order) return

  await prisma.offrampOrder.update({
    where: { id: order.id },
    data: {
      status: 'FUNDED',
      receivedTxHash: txHash,
      receivedAmount: new Decimal(amountStablecoin),
    },
  })

  await dispatchWebhookEvent(order.customerId, 'offramp.funded', {
    orderId: order.id,
    txHash,
    amountStablecoin,
  }, { offrampOrderId: order.id })

  setImmediate(() => executeOfframpDisbursement(order.id).catch(console.error))
}

async function executeOfframpDisbursement(orderId: string): Promise<void> {
  const order = await prisma.offrampOrder.findUniqueOrThrow({ where: { id: orderId } })

  if (order.status !== 'FUNDED') return

  await prisma.offrampOrder.update({
    where: { id: orderId },
    data: { status: 'DISBURSING' },
  })

  try {
    const amountIdr = order.quotedAmountIdr.toString()
    let result

    if (order.disbursementType === DisbursementType.BANK_TRANSFER) {
      result = await disburseToBankAccount({
        bankCode: order.bankCode!,
        accountNumber: order.accountNumber!,
        accountName: order.accountName!,
        amountIdr,
        referenceId: orderId,
      })
    } else {
      result = await disburseToEwallet({
        ewalletCode: order.ewalletCode!,
        phoneNumber: order.ewalletPhone!,
        amountIdr,
        referenceId: orderId,
      })
    }

    const isCompleted = result.status === 'completed'

    await prisma.offrampOrder.update({
      where: { id: orderId },
      data: {
        status: isCompleted ? 'COMPLETED' : 'DISBURSING',
        disbursementId: result.disbursementId,
        actualAmountIdr: new Decimal(amountIdr),
        ...(isCompleted ? { completedAt: new Date() } : {}),
      },
    })

    if (isCompleted) {
      await dispatchWebhookEvent(order.customerId, 'offramp.completed', {
        orderId,
        disbursementId: result.disbursementId,
        amountIdr,
      }, { offrampOrderId: orderId })
    }
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err)
    await prisma.offrampOrder.update({
      where: { id: orderId },
      data: { status: 'FAILED', failReason: reason, failedAt: new Date() },
    })
    await dispatchWebhookEvent(order.customerId, 'offramp.failed', {
      orderId,
      reason,
    }, { offrampOrderId: orderId })
  }
}

// Called by DurianPay webhook when async disbursement completes
export async function handleDisbursementCallback(
  disbursementId: string,
  newStatus: 'completed' | 'failed'
): Promise<void> {
  const order = await prisma.offrampOrder.findFirst({
    where: { disbursementId, status: 'DISBURSING' },
  })
  if (!order) return

  if (newStatus === 'completed') {
    await prisma.offrampOrder.update({
      where: { id: order.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })
    await dispatchWebhookEvent(order.customerId, 'offramp.completed', {
      orderId: order.id,
      disbursementId,
    }, { offrampOrderId: order.id })
  } else {
    await prisma.offrampOrder.update({
      where: { id: order.id },
      data: { status: 'FAILED', failReason: 'Disbursement failed', failedAt: new Date() },
    })
    await dispatchWebhookEvent(order.customerId, 'offramp.failed', {
      orderId: order.id,
      disbursementId,
    }, { offrampOrderId: order.id })
  }
}
