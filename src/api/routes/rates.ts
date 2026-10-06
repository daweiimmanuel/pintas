import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getVwapRate, quoteOnramp, quoteOfframp } from '../../services/exchange/aggregator.js'
import { Stablecoin, Chain } from '../../types/index.js'

const ratesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /v1/rates
  fastify.get('/rates', async (_req, reply) => {
    const [usdtRate, usdcRate] = await Promise.all([
      getVwapRate('USDT'),
      getVwapRate('USDC').catch(() => null),
    ])

    return reply.send({
      success: true,
      data: {
        rates: [usdtRate, ...(usdcRate ? [usdcRate] : [])],
        updatedAt: new Date().toISOString(),
      },
    })
  })

  // GET /v1/rates/quote/onramp?amountIdr=1000000&stablecoin=USDT&chain=POLYGON
  fastify.get('/rates/quote/onramp', async (req, reply) => {
    const schema = z.object({
      amountIdr: z.string().regex(/^\d+(\.\d+)?$/),
      stablecoin: z.nativeEnum(Stablecoin).default(Stablecoin.USDT),
      chain: z.nativeEnum(Chain).default(Chain.POLYGON),
    })

    const query = schema.parse(req.query)
    const quote = await quoteOnramp(query)

    return reply.send({ success: true, data: quote })
  })

  // GET /v1/rates/quote/offramp?amountStablecoin=10&stablecoin=USDT&chain=POLYGON
  fastify.get('/rates/quote/offramp', async (req, reply) => {
    const schema = z.object({
      amountStablecoin: z.string().regex(/^\d+(\.\d+)?$/),
      stablecoin: z.nativeEnum(Stablecoin).default(Stablecoin.USDT),
      chain: z.nativeEnum(Chain).default(Chain.POLYGON),
    })

    const query = schema.parse(req.query)
    const quote = await quoteOfframp(query)

    return reply.send({ success: true, data: quote })
  })

  // GET /v1/rates/live — WebSocket real-time rate feed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fastify.get('/rates/live', { websocket: true }, (socket: any) => {
    let subscribed: string[] = ['USDT', 'USDC']

    async function tick() {
      for (const coin of subscribed) {
        try {
          const rate = await getVwapRate(coin as Stablecoin)
          if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify({ ...rate, updatedAt: new Date().toISOString() }))
          }
        } catch { /* skip on error */ }
      }
    }

    // Send first tick immediately, then on interval
    void tick()
    const interval = setInterval(() => void tick(), 5000)

    socket.on('message', (msg: Buffer) => {
      try {
        const data = JSON.parse(msg.toString()) as { subscribe?: string[] }
        if (Array.isArray(data.subscribe)) subscribed = data.subscribe
      } catch { /* ignore invalid messages */ }
    })

    socket.on('close', () => clearInterval(interval))
    socket.on('error', () => clearInterval(interval))
  })
}

export default ratesRoutes
