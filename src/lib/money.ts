// USD amounts are integer cents (BigInt). USDC amounts are integer micro-units (6 decimals, BigInt).
// 1 USD = 100n cents. 1 USDC = 1_000_000n micro-USDC. 1 cent = 10_000n micro-USDC.
// No floating-point arithmetic in money paths. Rounding is half-even, applied once at fee calculation.

export const USD_CENTS_PER_DOLLAR = 100n
export const USDC_MICRO_PER_USDC  = 1_000_000n
export const MICRO_USDC_PER_CENT  = 10_000n

export interface PricingTier {
  upToCents: bigint | null  // null = no upper bound
  bps: number
}

export interface PricingConfig {
  version: string
  tiers: PricingTier[]
  capCents: bigint
  minFeeCents: bigint
}

export function centsToMicroUsdc(cents: bigint): bigint {
  return cents * MICRO_USDC_PER_CENT
}

export function microUsdcToCents(micro: bigint): bigint {
  return micro / MICRO_USDC_PER_CENT
}

// Format cents as a decimal USD string: 123456n → "1234.56"
export function formatUsdCents(cents: bigint): string {
  const abs = cents < 0n ? -cents : cents
  const sign = cents < 0n ? '-' : ''
  const dollars = abs / 100n
  const pennies = abs % 100n
  return `${sign}${dollars}.${String(pennies).padStart(2, '0')}`
}

// Parse a decimal USD string to cents: "1234.56" → 123456n
// Accepts integers ("1234") and up to 2 decimal places.
export function parseCents(s: string): bigint {
  const trimmed = s.trim()
  const negative = trimmed.startsWith('-')
  const abs = negative ? trimmed.slice(1) : trimmed
  const dot = abs.indexOf('.')
  if (dot === -1) {
    return (negative ? -1n : 1n) * BigInt(abs) * 100n
  }
  const intPart = abs.slice(0, dot)
  const fracRaw = abs.slice(dot + 1)
  if (fracRaw.length > 2) throw new RangeError(`parseCents: too many decimal places in "${s}"`)
  const fracPadded = fracRaw.padEnd(2, '0')
  const total = BigInt(intPart) * 100n + BigInt(fracPadded)
  return negative ? -total : total
}

// Calculate fee using tiered-and-capped pricing (marginal across tiers).
// Rounding: half-even (banker's rounding) applied to each tier slice, summed.
export function calcFee(amountCents: bigint, pricing: PricingConfig): bigint {
  if (amountCents <= 0n) return 0n

  let remaining = amountCents
  let fee = 0n
  let consumed = 0n

  for (const tier of pricing.tiers) {
    if (remaining <= 0n) break
    const tierCap = tier.upToCents !== null ? tier.upToCents - consumed : null
    const slice = tierCap !== null ? (remaining < tierCap ? remaining : tierCap) : remaining
    fee += roundHalfEven(slice * BigInt(tier.bps), 10_000n)
    consumed += slice
    remaining -= slice
  }

  // Apply cap and minimum
  if (fee > pricing.capCents) fee = pricing.capCents
  if (fee < pricing.minFeeCents) fee = pricing.minFeeCents
  // Cap overrides minimum only if cap < minimum (degenerate config)
  if (pricing.capCents < pricing.minFeeCents && fee > pricing.capCents) fee = pricing.capCents
  return fee
}

// Half-even (banker's) rounding: round(numerator / denominator)
function roundHalfEven(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  const half = denominator / 2n
  if (remainder < half) return quotient
  if (remainder > half) return quotient + 1n
  // Exactly half: round to even
  return quotient % 2n === 0n ? quotient : quotient + 1n
}
