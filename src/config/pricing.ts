// TODO(decision D5) — tier values and cap are EXAMPLE ONLY. Real values pending business decision.
import type { PricingConfig } from '../lib/money.js'

export const PRICING_V1: PricingConfig = {
  version: 'v1-example',
  tiers: [
    { upToCents: 5_000_000n,  bps: 50 },  // first $50k at 0.5%
    { upToCents: 25_000_000n, bps: 30 },  // $50k–$250k at 0.3%
    { upToCents: null,        bps: 15 },  // above $250k at 0.15%
  ],
  capCents:    150_000n,  // $1,500 max per order
  minFeeCents:   2_500n,  // $25 min per order
}
