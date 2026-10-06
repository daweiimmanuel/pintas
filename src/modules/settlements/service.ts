import { prisma } from '../../db/client.js'
import { formatUsdCents } from '../../lib/money.js'
import type { SettlementStatus } from '@prisma/client'

const SETTLEMENT_EXPIRY_HOURS = Number(process.env.SETTLEMENT_EXPIRY_HOURS ?? 48)

export interface CreateSettlementInput {
  exporterId: string
  buyerId: string
  quoteId: string
  invoiceRef: string
}

function formatOrder(o: {
  id: string; exporterId: string; buyerId: string; quoteId: string; invoiceRef: string;
  invoiceAmountCents: bigint; fundedAmountCents: bigint; feeCents: bigint; netPayoutCents: bigint;
  status: SettlementStatus; statusReason: string | null; expiresAt: Date; version: number;
  createdAt: Date; updatedAt: Date;
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
  return formatOrder(order)
}

export async function getSettlement(id: string) {
  const order = await prisma.settlementOrder.findUnique({ where: { id } })
  return order ? formatOrder(order) : null
}

export async function getOrderEvents(orderId: string) {
  return prisma.orderEvent.findMany({
    where: { orderId },
    orderBy: { createdAt: 'asc' },
  })
}
