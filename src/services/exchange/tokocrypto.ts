import axios from 'axios'
import crypto from 'crypto'
import { config } from '../../config/index.js'
import type { RateQuote } from '../../types/index.js'

const BASE_URL = 'https://www.tokocrypto.com'

interface TokocryptoBookTicker {
  symbol: string
  bidPrice: string
  bidQty: string
  askPrice: string
  askQty: string
}

interface Tokocrypto24hrTicker {
  symbol: string
  volume: string
  quoteVolume: string
  lastPrice: string
  bidPrice: string
  askPrice: string
}

export async function fetchTokocryptoRate(pair: 'USDT' | 'USDC'): Promise<RateQuote> {
  const symbol = pair === 'USDT' ? 'USDTIDR' : 'USDCIDR'

  const [bookRes, statsRes] = await Promise.all([
    axios.get<TokocryptoBookTicker>(`${BASE_URL}/open/v1/market/bookTicker`, {
      params: { symbol },
      timeout: 5000,
    }),
    axios.get<{ data: Tokocrypto24hrTicker }>(`${BASE_URL}/open/v1/market/ticker`, {
      params: { symbol },
      timeout: 5000,
    }),
  ])

  const book = bookRes.data
  const stats = statsRes.data.data
  const mid = (parseFloat(book.bidPrice) + parseFloat(book.askPrice)) / 2

  return {
    pair: `IDR_${pair}`,
    bid: book.bidPrice,
    ask: book.askPrice,
    mid: mid.toFixed(2),
    venue: 'tokocrypto',
    volume24h: stats.quoteVolume,
    fetchedAt: new Date(),
  }
}

interface TokocryptoOrderResponse {
  data: {
    orderId: string
    status: string
    executedQty: string
    cummulativeQuoteQty: string
  }
}

export async function executeTokocryptoTrade(params: {
  type: 'BUY' | 'SELL'
  pair: 'USDT' | 'USDC'
  amountIdr?: string
  amountCoin?: string
}): Promise<{ orderId: string; executedAmount: string; executedIdr: string }> {
  if (!config.TOKOCRYPTO_API_KEY || !config.TOKOCRYPTO_API_SECRET) {
    throw new Error('Tokocrypto credentials not configured')
  }

  const symbol = params.pair === 'USDT' ? 'USDTIDR' : 'USDCIDR'
  const timestamp = Date.now()

  const body: Record<string, string | number> = {
    symbol,
    side: params.type,
    type: 'MARKET',
    timestamp,
  }

  if (params.type === 'BUY' && params.amountIdr) {
    body.quoteOrderQty = params.amountIdr
  } else if (params.type === 'SELL' && params.amountCoin) {
    body.quantity = params.amountCoin
  }

  const queryString = new URLSearchParams(
    Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)]))
  ).toString()

  const signature = crypto
    .createHmac('sha256', config.TOKOCRYPTO_API_SECRET!)
    .update(queryString)
    .digest('hex')

  const res = await axios.post<TokocryptoOrderResponse>(
    `${BASE_URL}/open/v1/orders?${queryString}&signature=${signature}`,
    {},
    {
      headers: { 'X-MBX-APIKEY': config.TOKOCRYPTO_API_KEY! },
      timeout: 10000,
    }
  )

  const order = res.data.data
  return {
    orderId: order.orderId,
    executedAmount: order.executedQty,
    executedIdr: order.cummulativeQuoteQty,
  }
}
