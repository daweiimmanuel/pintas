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
}

export default ratesRoutes
