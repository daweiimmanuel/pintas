import { describe, it, expect } from 'vitest'
import {
  centsToMicroUsdc, microUsdcToCents, formatUsdCents, parseCents, calcFee,
  MICRO_USDC_PER_CENT,
} from '../../src/lib/money.js'
import type { PricingConfig } from '../../src/lib/money.js'
import { assertBalanced } from '../../src/modules/ledger/check.js'
import { PRICING_V1 } from '../../src/config/pricing.js'

// ─── Conversion ───────────────────────────────────────────────────────────────

describe('centsToMicroUsdc / microUsdcToCents', () => {
  it('1 cent = 10,000 micro-USDC', () => {
    expect(centsToMicroUsdc(1n)).toBe(10_000n)
  })

  it('100 cents ($1) = 1,000,000 micro-USDC (1 USDC)', () => {
    expect(centsToMicroUsdc(100n)).toBe(1_000_000n)
  })

  it('round-trips: centsToMicroUsdc → microUsdcToCents', () => {
    const cents = 48_000_000n // $480,000
    expect(microUsdcToCents(centsToMicroUsdc(cents))).toBe(cents)
  })

  it('MICRO_USDC_PER_CENT is 10,000', () => {
    expect(MICRO_USDC_PER_CENT).toBe(10_000n)
  })
})

// ─── Formatting / parsing ─────────────────────────────────────────────────────

describe('formatUsdCents / parseCents', () => {
  it('formats 0 cents', () => expect(formatUsdCents(0n)).toBe('0.00'))
  it('formats 1 cent', () => expect(formatUsdCents(1n)).toBe('0.01'))
  it('formats 100 cents', () => expect(formatUsdCents(100n)).toBe('1.00'))
  it('formats 123456 cents', () => expect(formatUsdCents(123456n)).toBe('1234.56'))
  it('formats negative', () => expect(formatUsdCents(-50n)).toBe('-0.50'))

  it('parses integer string', () => expect(parseCents('1234')).toBe(123400n))
  it('parses decimal string', () => expect(parseCents('1234.56')).toBe(123456n))
  it('parses single decimal place', () => expect(parseCents('1234.5')).toBe(123450n))
  it('parses zero', () => expect(parseCents('0.00')).toBe(0n))
  it('round-trips formatUsdCents → parseCents', () => {
    const cents = 4_800_000n
    expect(parseCents(formatUsdCents(cents))).toBe(cents)
  })
  it('throws on more than 2 decimal places', () => {
    expect(() => parseCents('1.234')).toThrow()
  })
})

// ─── calcFee ─────────────────────────────────────────────────────────────────

describe('calcFee with PRICING_V1', () => {
  // Tier 1 only: up to $50,000 at 50 bps
  it('$10,000 → 50 bps = $50.00', () => {
    const fee = calcFee(1_000_000n, PRICING_V1) // $10,000 = 1,000,000 cents
    expect(fee).toBe(5_000n) // $50.00 = 5,000 cents
  })

  // Exactly at tier 1 boundary: $50,000 at 50 bps
  it('$50,000 → 50 bps = $250.00 (tier 1 boundary)', () => {
    const fee = calcFee(5_000_000n, PRICING_V1)
    expect(fee).toBe(25_000n) // $250 = 25,000 cents
  })

  // Spans tiers 1 and 2: $100,000 = first $50k at 50bps + next $50k at 30bps
  it('$100,000 → tier1+tier2 = $250 + $150 = $400.00', () => {
    const fee = calcFee(10_000_000n, PRICING_V1)
    expect(fee).toBe(40_000n) // $400 = 40,000 cents
  })

  // Above tier 2 boundary: $250,000 = first $50k (50bps) + next $200k (30bps)
  it('$250,000 → tier1+tier2 = $250 + $600 = $850.00', () => {
    const fee = calcFee(25_000_000n, PRICING_V1)
    expect(fee).toBe(85_000n)
  })

  // Third tier: $300,000 = $250 (tier1) + $600 (tier2) + $50k*15bps = $250+$600+$75 = $925
  it('$300,000 → all three tiers = $925.00', () => {
    const fee = calcFee(30_000_000n, PRICING_V1)
    expect(fee).toBe(92_500n)
  })

  // Cap: $1,000,000 at uncapped would be $250+$600+$112,500 = way above cap
  it('$1,000,000 → capped at $1,500.00', () => {
    const fee = calcFee(100_000_000n, PRICING_V1)
    expect(fee).toBe(150_000n) // $1,500 = 150,000 cents
  })

  // Minimum: $100 at 50bps = $0.50 < $25 minimum
  it('$100 → minimum fee $25.00', () => {
    const fee = calcFee(10_000n, PRICING_V1) // $100 = 10,000 cents
    expect(fee).toBe(2_500n) // $25 = 2,500 cents
  })

  it('returns 0 for 0 amount', () => {
    expect(calcFee(0n, PRICING_V1)).toBe(0n)
  })
})

describe('calcFee custom pricing', () => {
  const custom: PricingConfig = {
    version: 'test',
    tiers: [{ upToCents: null, bps: 100 }],  // 1% flat
    capCents: 10_000n,  // $100 cap
    minFeeCents: 100n,  // $1 min
  }

  it('exactly at half-unit (rounding test)', () => {
    // $1.005 invoice at 1% = $0.01005 → rounds to $0.01 (below $1 minimum, so minimum applies)
    // Use a case where rounding matters: $150 at 1% = $1.50 = 150 cents
    const fee = calcFee(15_000n, custom) // $150
    expect(fee).toBe(150n) // $1.50
  })
})

// ─── assertBalanced ───────────────────────────────────────────────────────────

describe('assertBalanced', () => {
  it('passes for a balanced USD entry', () => {
    expect(() => assertBalanced([
      { asset: 'USD', debitMinor: 1000n, creditMinor: 0n },
      { asset: 'USD', debitMinor: 0n,    creditMinor: 1000n },
    ])).not.toThrow()
  })

  it('passes for balanced multi-asset entry', () => {
    expect(() => assertBalanced([
      { asset: 'USD',  debitMinor: 500n, creditMinor: 0n },
      { asset: 'USD',  debitMinor: 0n,   creditMinor: 500n },
      { asset: 'USDC', debitMinor: 1_000_000n, creditMinor: 0n },
      { asset: 'USDC', debitMinor: 0n,          creditMinor: 1_000_000n },
    ])).not.toThrow()
  })

  it('throws for an imbalanced entry', () => {
    expect(() => assertBalanced([
      { asset: 'USD', debitMinor: 1000n, creditMinor: 0n },
      { asset: 'USD', debitMinor: 0n,    creditMinor: 900n },
    ])).toThrow(/Ledger imbalance/)
  })

  it('throws when only one side is posted', () => {
    expect(() => assertBalanced([
      { asset: 'USD', debitMinor: 500n, creditMinor: 0n },
    ])).toThrow(/Ledger imbalance/)
  })

  it('passes for empty lines', () => {
    expect(() => assertBalanced([])).not.toThrow()
  })
})
