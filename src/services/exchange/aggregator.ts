import crypto from 'crypto'
import Decimal from 'decimal.js'
import { prisma } from '../../db/client.js'
import { getRedis } from '../../lib/redis.js'
import { fetchIndodaxRate } from './indodax.js'
import { fetchTokocryptoRate } from './tokocrypto.js'
import type { RateQuote, VwapRate, OnrampQuote, OfframpQuote } from '../../types/index.js'
import { Stablecoin, Chain } from '../../types/index.js'

const RATE_CACHE_TTL_S = 10
const SPREAD_BPS = 40
const QUOTE_VALIDITY_MS = 30_000

async function fetchAllRates(pair: 'USDT' | 'USDC'): Promise<RateQuote[]> {
  const results = await Promise.allSettled([
    fetchIndodaxRate(pair),
    fetchTokocryptoRate(pair),
  ])

  return results
    .filter((r): r is PromiseFulfilledResult<RateQuote> => r.status === 'fulfilled')
    .map((r) => r.value)
}

export async function getVwapRate(pair: 'USDT' | 'USDC'): Promise<VwapRate> {
  const cacheKey = `IDR_${pair}`
  const redisKey = `pintas:vwap:${cacheKey}`

  try {
    const cached = await getRedis().get(redisKey)
    if (cached) return JSON.parse(cached) as VwapRate
  } catch {
    // Redis miss — fall through to live fetch
  }

  const quotes = await fetchAllRates(pair)

  if (quotes.length === 0) {
    throw new Error(`No exchange rates available for IDR_${pair}`)
  }

  let totalVolume = new Decimal(0)
  let weightedBid = new Decimal(0)
  let weightedAsk = new Decimal(0)

  for (const q of quotes) {
    const vol = new Decimal(q.volume24h ?? '1')
    totalVolume = totalVolume.plus(vol)
    weightedBid = weightedBid.plus(new Decimal(q.bid).times(vol))
    weightedAsk = weightedAsk.plus(new Decimal(q.ask).times(vol))
  }

  const vwapBid = weightedBid.div(totalVolume)
  const vwapAsk = weightedAsk.div(totalVolume)
  const mid = vwapBid.plus(vwapAsk).div(2)

  const rate: VwapRate = {
    pair: cacheKey,
    bid: vwapBid.toFixed(2),
    ask: vwapAsk.toFixed(2),
    mid: mid.toFixed(2),
    volume24h: totalVolume.toFixed(2),
    sources: quotes.map((q) => q.venue),
    fetchedAt: new Date(),
  }

  getRedis().set(redisKey, JSON.stringify(rate), 'EX', RATE_CACHE_TTL_S).catch(() => {})

  prisma.exchangeRate.create({
    data: {
      pair: cacheKey,
      bid: new Decimal(rate.bid),
      ask: new Decimal(rate.ask),
      mid: new Decimal(rate.mid),
      venue: 'vwap',
      volume24h: new Decimal(rate.volume24h),
    },
  }).catch(() => {})

  return rate
}

function computeOnramp(
  amountIdr: string,
  vwapRate: VwapRate,
  spreadBps: number
): { quotedAmount: string; rate: string; fee: string } {
  const spreadMultiplier = new Decimal(1).plus(new Decimal(spreadBps).div(10000))
  const effectiveRate = new Decimal(vwapRate.ask).times(spreadMultiplier)
  const quotedAmount = new Decimal(amountIdr).div(effectiveRate)
  const fee = new Decimal(amountIdr).minus(quotedAmount.times(new Decimal(vwapRate.mid)))
  return {
    quotedAmount: quotedAmount.toFixed(6),
    rate: effectiveRate.toFixed(2),
    fee: fee.gt(0) ? fee.toFixed(2) : '0',
  }
}

function computeOfframp(
  amountStablecoin: string,
  vwapRate: VwapRate,
  spreadBps: number
): { quotedAmountIdr: string; rate: string; fee: string } {
  const spreadMultiplier = new Decimal(1).minus(new Decimal(spreadBps).div(10000))
  const effectiveRate = new Decimal(vwapRate.bid).times(spreadMultiplier)
  const quotedAmountIdr = new Decimal(amountStablecoin).times(effectiveRate)
  const fee = new Decimal(amountStablecoin)
    .times(new Decimal(vwapRate.mid))
    .minus(quotedAmountIdr)
  return {
    quotedAmountIdr: quotedAmountIdr.toFixed(2),
    rate: effectiveRate.toFixed(2),
    fee: fee.gt(0) ? fee.toFixed(2) : '0',
  }
}

export async function quoteOnramp(params: {
  amountIdr: string
  stablecoin?: Stablecoin
  chain?: Chain
  spreadBps?: number
}): Promise<OnrampQuote> {
  const stablecoin = params.stablecoin ?? Stablecoin.USDT
  const chain = params.chain ?? Chain.POLYGON
  const spreadBps = params.spreadBps ?? SPREAD_BPS
  const pair = stablecoin === Stablecoin.USDC ? 'USDC' : 'USDT'
  const vwapRate = await getVwapRate(pair)
  const { quotedAmount, rate, fee } = computeOnramp(params.amountIdr, vwapRate, spreadBps)

  return {
    orderId: crypto.randomUUID(),
    amountIdr: params.amountIdr,
    stablecoin,
    chain,
    rate,
    quotedAmount,
    spreadBps,
    fee,
    expiresAt: new Date(Date.now() + QUOTE_VALIDITY_MS),
  }
}

export async function quoteOfframp(params: {
  amountStablecoin: string
  stablecoin?: Stablecoin
  chain?: Chain
  spreadBps?: number
}): Promise<OfframpQuote> {
  const stablecoin = params.stablecoin ?? Stablecoin.USDT
  const chain = params.chain ?? Chain.POLYGON
  const spreadBps = params.spreadBps ?? SPREAD_BPS
  const pair = stablecoin === Stablecoin.USDC ? 'USDC' : 'USDT'
  const vwapRate = await getVwapRate(pair)
  const { quotedAmountIdr, rate, fee } = computeOfframp(params.amountStablecoin, vwapRate, spreadBps)
  const depositAddress = process.env[`${chain}_${stablecoin}_SETTLEMENT_ADDRESS`] ?? 'PENDING_CONFIG'

  return {
    orderId: crypto.randomUUID(),
    amountStablecoin: params.amountStablecoin,
    stablecoin,
    chain,
    rate,
    quotedAmountIdr,
    spreadBps,
    fee,
    expiresAt: new Date(Date.now() + QUOTE_VALIDITY_MS),
    depositAddress,
  }
}
