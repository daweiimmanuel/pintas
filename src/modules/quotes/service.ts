import { prisma } from '../../db/client.js'
import { calcFee, formatUsdCents, parseCents } from '../../lib/money.js'
import { PRICING_V1 } from '../../config/pricing.js'

const QUOTE_TTL_HOURS = Number(process.env.QUOTE_TTL_HOURS ?? 24)

export interface CreateQuoteInput {
  exporterId: string
  invoiceAmountCents: bigint
}

export interface QuoteResult {
  id: string
  exporterId: string
  invoiceAmountUsd: string   // formatted decimal
  feeUsd: string
  netPayoutUsd: string
  pricingVersion: string
  expiresAt: string
  createdAt: string
}

function quoteToResult(q: {
  id: string; exporterId: string; invoiceAmountCents: bigint;
  feeCents: bigint; netPayoutCents: bigint; pricingVersion: string;
  expiresAt: Date; createdAt: Date;
}): QuoteResult {
  return {
    id: q.id,
    exporterId: q.exporterId,
    invoiceAmountUsd: formatUsdCents(q.invoiceAmountCents),
    feeUsd: formatUsdCents(q.feeCents),
    netPayoutUsd: formatUsdCents(q.netPayoutCents),
    pricingVersion: q.pricingVersion,
    expiresAt: q.expiresAt.toISOString(),
    createdAt: q.createdAt.toISOString(),
  }
}

export async function createQuote(input: CreateQuoteInput): Promise<QuoteResult> {
  const feeCents = calcFee(input.invoiceAmountCents, PRICING_V1)
  const netPayoutCents = input.invoiceAmountCents - feeCents
  const expiresAt = new Date(Date.now() + QUOTE_TTL_HOURS * 3_600_000)

  const quote = await prisma.quote.create({
    data: {
      exporterId: input.exporterId,
      invoiceAmountCents: input.invoiceAmountCents,
      feeCents,
      netPayoutCents,
      pricingVersion: PRICING_V1.version,
      expiresAt,
    },
  })
  return quoteToResult(quote)
}

export async function getQuote(id: string): Promise<QuoteResult | null> {
  const quote = await prisma.quote.findUnique({ where: { id } })
  return quote ? quoteToResult(quote) : null
}

export { parseCents }
