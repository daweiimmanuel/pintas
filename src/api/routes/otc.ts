import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { quoteOtc, acceptOtc, cancelOtc, getOtcOrder } from '../../services/otc/index.js'

const otcRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/otc/quote — request a locked OTC quote (min IDR 75M)
  fastify.post('/otc/quote', async (req, reply) => {
    const schema = z.object({
      side: z.enum(['BUY', 'SELL']),
      stablecoin: z.enum(['USDT', 'USDC']).default('USDT'),
      chain: z.enum(['POLYGON', 'TRON', 'STELLAR', 'ETHEREUM']).default('TRON'),
      amountIdr: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid IDR amount'),
      spreadBps: z.coerce.number().int().min(0).max(500).optional(),
      destinationAddress: z.string().optional(),
      bankCode: z.string().optional(),
      accountNumber: z.string().optional(),
      accountName: z.string().optional(),
    })

    const body = schema.parse(req.body)

    const quote = await quoteOtc({
      customerId: req.customerId,
      ...body,
    })

    return reply.status(201).send({ success: true, data: quote })
  })

  // POST /v1/otc/:orderId/accept — lock and execute a quote
  fastify.post('/otc/:orderId/accept', async (req, reply) => {
    const { orderId } = z.object({ orderId: z.string() }).parse(req.params)

    const order = await acceptOtc(orderId, req.customerId)

    return reply.send({ success: true, data: order })
  })

  // POST /v1/otc/:orderId/cancel — cancel a QUOTED or ACCEPTED order
  fastify.post('/otc/:orderId/cancel', async (req, reply) => {
    const { orderId } = z.object({ orderId: z.string() }).parse(req.params)

    const order = await cancelOtc(orderId, req.customerId)

    return reply.send({ success: true, data: order })
  })

  // GET /v1/otc/:orderId — retrieve an OTC order
  fastify.get('/otc/:orderId', async (req, reply) => {
    const { orderId } = z.object({ orderId: z.string() }).parse(req.params)

    const order = await getOtcOrder(orderId, req.customerId)

    if (!order) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'OTC order not found' },
      })
    }

    return reply.send({ success: true, data: order })
  })
}

export default otcRoutes
