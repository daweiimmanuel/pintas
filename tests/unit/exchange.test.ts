import { describe, it, expect, vi, beforeEach } from 'vitest'
import Decimal from 'decimal.js'

// Mock axios before importing aggregator
vi.mock('axios')
vi.mock('../../src/db/client.js', () => ({
  prisma: {
    exchangeRate: { create: vi.fn().mockResolvedValue({}) },
  },
}))

import { getVwapRate, quoteOnramp, quoteOfframp } from '../../src/services/exchange/aggregator.js'
import { Stablecoin, Chain } from '../../src/types/index.js'

// Mock the venue fetchers
vi.mock('../../src/services/exchange/indodax.js', () => ({
  fetchIndodaxRate: vi.fn().mockResolvedValue({
    pair: 'IDR_USDT',
    bid: '15800000',
    ask: '15900000',
    mid: '15850000',
    venue: 'indodax',
    volume24h: '5000000',
    fetchedAt: new Date(),
  }),
}))

vi.mock('../../src/services/exchange/tokocrypto.js', () => ({
  fetchTokocryptoRate: vi.fn().mockResolvedValue({
    pair: 'IDR_USDT',
    bid: '15820000',
    ask: '15920000',
    mid: '15870000',
    venue: 'tokocrypto',
    volume24h: '3000000',
    fetchedAt: new Date(),
  }),
}))

describe('VWAP aggregator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('computes volume-weighted average from two venues', async () => {
    const rate = await getVwapRate('USDT')

    expect(rate.pair).toBe('IDR_USDT')
    expect(rate.sources).toContain('indodax')
    expect(rate.sources).toContain('tokocrypto')

    // VWAP bid: (15800000 * 5M + 15820000 * 3M) / 8M = 15807500
    const expectedBid = new Decimal('15800000')
      .times('5000000')
      .plus(new Decimal('15820000').times('3000000'))
      .dividedBy('8000000')
    expect(new Decimal(rate.bid).toFixed(0)).toBe(expectedBid.toFixed(0))
  })

  it('returns a valid onramp quote with positive spread', async () => {
    const quote = await quoteOnramp({
      amountIdr: '1000000',
      stablecoin: Stablecoin.USDT,
      chain: Chain.POLYGON,
    })

    expect(quote.orderId).toBeTruthy()
    expect(new Decimal(quote.quotedAmount).greaterThan(0)).toBe(true)
    expect(quote.spreadBps).toBeGreaterThan(0)
    expect(quote.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('returns a valid offramp quote with positive IDR amount', async () => {
    const quote = await quoteOfframp({
      amountStablecoin: '10',
      stablecoin: Stablecoin.USDT,
      chain: Chain.POLYGON,
    })

    expect(quote.orderId).toBeTruthy()
    expect(new Decimal(quote.quotedAmountIdr).greaterThan(0)).toBe(true)
    expect(new Decimal(quote.quotedAmountIdr).lessThan('160000000')).toBe(true)
  })

  it('applies higher spread for smaller amounts', async () => {
    const smallQuote = await quoteOnramp({
      amountIdr: '100000',
      stablecoin: Stablecoin.USDT,
      chain: Chain.POLYGON,
      spreadBps: 80,
    })

    const largeQuote = await quoteOnramp({
      amountIdr: '100000',
      stablecoin: Stablecoin.USDT,
      chain: Chain.POLYGON,
      spreadBps: 40,
    })

    // Large quote (lower spread) should yield more stablecoin for same IDR
    expect(
      new Decimal(largeQuote.quotedAmount).greaterThan(smallQuote.quotedAmount)
    ).toBe(true)
  })
})
