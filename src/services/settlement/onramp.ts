import Decimal from 'decimal.js'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { quoteOnramp } from '../exchange/aggregator.js'
import { createVirtualAccount } from '../biffast/index.js'
import { dispatchWebhookEvent } from '../webhook/delivery.js'
import type { Chain, Stablecoin, OnrampQuote } from '../../types/index.js'

export interface CreateOnrampParams {
  customerId: string
  amountIdr: string
  stablecoin: Stablecoin
  chain: Chain
  destinationAddress: string
  referenceId?: string
  metadata?: Record<string, unknown> | null
  spreadBps?: number
}

export async function createOnrampOrder(
  params: CreateOnrampParams
): Promise<{ order: object; virtualAccount: object; quote: OnrampQuote }> {
  const quote = await quoteOnramp({
    amountIdr: params.amountIdr,
    stablecoin: params.stablecoin,
    chain: params.chain,
    spreadBps: params.spreadBps,
  })

  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: params.customerId },
    select: { name: true },
  })

  const va = await createVirtualAccount({
    orderId: quote.orderId,
    amountIdr: params.amountIdr,
    customerName: customer.name,
    expiryMinutes: 60,
  })

  const order = await prisma.onrampOrder.create({
    data: {
      id: quote.orderId,
      customerId: params.customerId,
      amountIdr: new Decimal(params.amountIdr),
      stablecoin: params.stablecoin,
      chain: params.chain,
      quotedRate: new Decimal(quote.rate),
      quotedAmount: new Decimal(quote.quotedAmount),
      spreadBps: quote.spreadBps,
      quoteExpiresAt: quote.expiresAt,
      destinationAddress: params.destinationAddress,
      referenceId: params.referenceId,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
      virtualAccount: {
        create: {
          bank: va.bank,
          vaNumber: va.vaNumber,
          amount: new Decimal(va.amount),
          currency: va.currency,
          expiresAt: va.expiresAt,
        },
      },
    },
    include: { virtualAccount: true },
  })

  await dispatchWebhookEvent(params.customerId, 'onramp.created', {
    orderId: order.id,
    amountIdr: params.amountIdr,
    stablecoin: params.stablecoin,
    chain: params.chain,
  }, { onrampOrderId: order.id })

  return { order, virtualAccount: va, quote }
}

export async function handleBifastPayment(
  vaNumber: string,
  paidAmountIdr: string,
  referenceNo: string
): Promise<void> {
  const va = await prisma.virtualAccount.findUnique({ where: { vaNumber } })
  if (!va) return

  const order = await prisma.onrampOrder.findUnique({
    where: { id: va.orderId },
    include: { customer: true },
  })
  if (!order || order.status !== 'PENDING') return

  // Mark VA paid and order funded
  await prisma.$transaction([
    prisma.virtualAccount.update({
      where: { id: va.id },
      data: { paidAt: new Date() },
    }),
    prisma.onrampOrder.update({
      where: { id: order.id },
      data: { status: 'FUNDED' },
    }),
  ])

  await dispatchWebhookEvent(order.customerId, 'onramp.funded', {
    orderId: order.id,
    paidAmountIdr,
    referenceNo,
  }, { onrampOrderId: order.id })

  // Trigger async conversion
  setImmediate(() => executeOnrampConversion(order.id).catch(console.error))
}

async function executeOnrampConversion(orderId: string): Promise<void> {
  const order = await prisma.onrampOrder.findUniqueOrThrow({
    where: { id: orderId },
  })

  if (order.status !== 'FUNDED') return

  await prisma.onrampOrder.update({
    where: { id: orderId },
    data: { status: 'CONVERTING' },
  })

  try {
    // Import lazily to avoid circular deps
    const { sendStablecoin } = await import('../blockchain/index.js')

    const tx = await sendStablecoin({
      chain: order.chain,
      to: order.destinationAddress,
      amount: order.quotedAmount.toString(),
      stablecoin: order.stablecoin,
    })

    await prisma.onrampOrder.update({
      where: { id: orderId },
      data: {
        status: 'COMPLETED',
        onchainTxHash: tx.txHash,
        onchainBlock: tx.blockNumber,
        actualAmount: new Decimal(tx.amount),
        completedAt: new Date(),
      },
    })

    await dispatchWebhookEvent(order.customerId, 'onramp.completed', {
      orderId,
      txHash: tx.txHash,
      amount: tx.amount,
      stablecoin: order.stablecoin,
      chain: order.chain,
    }, { onrampOrderId: orderId })
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err)
    await prisma.onrampOrder.update({
      where: { id: orderId },
      data: { status: 'FAILED', failReason: reason, failedAt: new Date() },
    })
    await dispatchWebhookEvent(order.customerId, 'onramp.failed', {
      orderId,
      reason,
    }, { onrampOrderId: orderId })
  }
}
