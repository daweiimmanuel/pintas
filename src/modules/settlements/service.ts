import { prisma } from '../../db/client.js'
import { formatUsdCents } from '../../lib/money.js'
import { getCollectionProvider } from '../../providers/index.js'
import type { SettlementStatus } from '@prisma/client'

const SETTLEMENT_EXPIRY_HOURS = Number(process.env.SETTLEMENT_EXPIRY_HOURS ?? 48)

export interface CreateSettlementInput {
  exporterId: string
  buyerId: string
  quoteId: string
  invoiceRef: string
}

interface CollectionInstructionShape {
  paymentReference: string
  virtualAccountRef: string
  bankDetailsJson: unknown
}

function formatOrder(o: {
  id: string; exporterId: string; buyerId: string; quoteId: string; invoiceRef: string;
  invoiceAmountCents: bigint; fundedAmountCents: bigint; feeCents: bigint; netPayoutCents: bigint;
  status: SettlementStatus; statusReason: string | null; expiresAt: Date; version: number;
  createdAt: Date; updatedAt: Date;
  collectionInstruction?: CollectionInstructionShape | null;
  buyer?: { legalName: string } | null;
}) {
  return {
    id: o.id,
    exporterId: o.exporterId,
    buyerId: o.buyerId,
    quoteId: o.quoteId,
    invoiceRef: o.invoiceRef,
    invoiceAmountUsd: formatUsdCents(o.invoiceAmountCents as bigint),
    fundedAmountUsd: formatUsdCents(o.fundedAmountCents as bigint),
    feeUsd: formatUsdCents(o.feeCents as bigint),
    netPayoutUsd: formatUsdCents(o.netPayoutCents as bigint),
    status: o.status,
    statusReason: o.statusReason,
    expiresAt: o.expiresAt.toISOString(),
    version: o.version,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    ...(o.collectionInstruction ? {
      collectionInstruction: {
        paymentReference: o.collectionInstruction.paymentReference,
        virtualAccountRef: o.collectionInstruction.virtualAccountRef,
        bankDetails: o.collectionInstruction.bankDetailsJson,
      },
    } : {}),
    ...(o.buyer ? { buyerName: o.buyer.legalName } : {}),
  }
}

export async function createSettlement(input: CreateSettlementInput) {
  const quote = await prisma.quote.findUniqueOrThrow({ where: { id: input.quoteId } })
  const expiresAt = new Date(Date.now() + SETTLEMENT_EXPIRY_HOURS * 3_600_000)

  const order = await prisma.settlementOrder.create({
    data: {
      exporterId: input.exporterId,
      buyerId: input.buyerId,
      quoteId: input.quoteId,
      invoiceRef: input.invoiceRef,
      invoiceAmountCents: quote.invoiceAmountCents,
      feeCents: quote.feeCents,
      netPayoutCents: quote.netPayoutCents,
      expiresAt,
    },
  })

  // Create collection instruction so the buyer knows where to send funds
  const collectionProvider = getCollectionProvider()
  const instruction = await collectionProvider.createInstruction(order.id, order.invoiceAmountCents as bigint)
  const ci = await prisma.collectionInstruction.create({
    data: {
      orderId: order.id,
      provider: instruction.provider,
      virtualAccountRef: instruction.virtualAccountRef,
      paymentReference: instruction.paymentReference,
      bankDetailsJson: instruction.bankDetails as object,
    },
  })

  return formatOrder({ ...order, collectionInstruction: ci })
}

export async function getSettlement(id: string) {
  const order = await prisma.settlementOrder.findUnique({
    where: { id },
    include: { collectionInstruction: true },
  })
  return order ? formatOrder(order) : null
}

export async function listSettlements(exporterId: string, limit = 50) {
  const orders = await prisma.settlementOrder.findMany({
    where: { exporterId },
    include: { buyer: { select: { legalName: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return orders.map(o => formatOrder(o))
}

export async function getOrderEvents(orderId: string) {
  return prisma.orderEvent.findMany({
    where: { orderId },
    orderBy: { createdAt: 'asc' },
  })
}
