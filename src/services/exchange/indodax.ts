import axios from 'axios'
import crypto from 'crypto'
import { config } from '../../config/index.js'
import type { RateQuote } from '../../types/index.js'

const BASE_URL = 'https://indodax.com'

interface IndodaxTicker {
  ticker: {
    high: string
    low: string
    vol_idr: string
    vol_usdt: string
    last: string
    buy: string
    sell: string
    server_time: number
  }
}

export async function fetchIndodaxRate(pair: 'USDT' | 'USDC'): Promise<RateQuote> {
  const symbol = pair === 'USDT' ? 'usdtidr' : 'usdcidr'

  const res = await axios.get<IndodaxTicker>(`${BASE_URL}/api/ticker/${symbol}`, {
    timeout: 5000,
  })

  const { ticker } = res.data

  return {
    pair: `IDR_${pair}`,
    bid: ticker.sell,  // Indodax: buy = price to buy IDR, sell = price to sell IDR; bid = best buy from market
    ask: ticker.buy,
    mid: String((parseFloat(ticker.buy) + parseFloat(ticker.sell)) / 2),
    venue: 'indodax',
    volume24h: ticker.vol_idr,
    fetchedAt: new Date(),
  }
}

interface IndodaxTradeResult {
  success: number
  return?: {
    order_id: string
    receive_btc?: string
    spend_rp?: string
    order?: Record<string, unknown>
  }
  error?: string
}

export async function executeIndodaxTrade(params: {
  type: 'buy' | 'sell'
  pair: 'USDT' | 'USDC'
  amountIdr?: string
  amountCoin?: string
}): Promise<{ orderId: string; executedAmount: string; executedIdr: string }> {
  if (!config.INDODAX_API_KEY || !config.INDODAX_API_SECRET) {
    throw new Error('Indodax credentials not configured')
  }

  const nonce = Date.now().toString()
  const pairSymbol = params.pair === 'USDT' ? 'usdt_idr' : 'usdc_idr'

  const body: Record<string, string> = {
    method: 'trade',
    pair: pairSymbol,
    type: params.type,
    nonce,
  }

  if (params.type === 'buy' && params.amountIdr) {
    body.idr = params.amountIdr
  } else if (params.type === 'sell' && params.amountCoin) {
    body[params.pair.toLowerCase()] = params.amountCoin
  }

  const queryString = new URLSearchParams(body).toString()
  const signature = crypto
    .createHmac('sha512', config.INDODAX_API_SECRET!)
    .update(queryString)
    .digest('hex')

  const res = await axios.post<IndodaxTradeResult>(`${BASE_URL}/tapi`, queryString, {
    headers: {
      Key: config.INDODAX_API_KEY!,
      Sign: signature,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 10000,
  })

  if (!res.data.success || !res.data.return) {
    throw new Error(`Indodax trade failed: ${res.data.error}`)
  }

  return {
    orderId: res.data.return.order_id,
    executedAmount: params.amountCoin ?? '0',
    executedIdr: params.amountIdr ?? '0',
  }
}
