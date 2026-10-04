import { Decimal } from 'decimal.js'

// Cached FX rates: key = "MYR_IDR", value = {rate, fetchedAt}
const fxCache = new Map<string, { rate: Decimal; fetchedAt: Date }>()
const CACHE_TTL_MS = 60_000 // 1 min

// Hard-coded fallback rates (used if API unavailable / sandbox)
const FALLBACK_RATES: Record<string, string> = {
  MYR_IDR: '3450',
  SAR_IDR: '4050',
  AED_IDR: '4150',
  SGD_IDR: '11500',
  USD_IDR: '15500',
  EUR_IDR: '16800',
  GBP_IDR: '19500',
}

export async function getFxRate(from: string, to: string): Promise<Decimal> {
  const pair = `${from}_${to}`
  const cached = fxCache.get(pair)

  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return cached.rate
  }

  try {
    const rate = await fetchLiveRate(from, to)
    fxCache.set(pair, { rate, fetchedAt: new Date() })
    return rate
  } catch {
    // Fall back to hardcoded rates in sandbox/test environments
    const fallback = FALLBACK_RATES[pair]
    if (fallback) {
      const rate = new Decimal(fallback)
      fxCache.set(pair, { rate, fetchedAt: new Date() })
      return rate
    }
    throw new Error(`No FX rate available for ${pair}`)
  }
}

async function fetchLiveRate(from: string, to: string): Promise<Decimal> {
  // Use Open Exchange Rates (or similar) if configured, else throw to trigger fallback
  const apiKey = process.env.OPEN_EXCHANGE_RATES_API_KEY
  if (!apiKey) throw new Error('No FX API key configured')

  const url = `https://openexchangerates.org/api/latest.json?app_id=${apiKey}&base=USD&symbols=${from},${to}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FX API error: ${res.status}`)

  const data = (await res.json()) as { rates: Record<string, number> }

  if (!data.rates[from] || !data.rates[to]) {
    throw new Error(`Missing rates for ${from} or ${to}`)
  }

  // Convert: from → USD → to
  const fromToUsd = new Decimal(1).div(data.rates[from])
  const usdToTarget = new Decimal(data.rates[to])
  return fromToUsd.mul(usdToTarget)
}
