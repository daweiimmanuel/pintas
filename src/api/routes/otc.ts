import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { quoteOtc, acceptOtc, cancelOtc, getOtcOrder } from '../../services/otc/index.js'
import { prisma } from '../../db/client.js'

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

  // GET /v1/otc — list OTC orders with cursor pagination
  fastify.get('/otc', {
    schema: {
      tags: ['otc'],
      summary: 'List OTC orders with optional status filter and cursor pagination',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['QUOTED', 'ACCEPTED', 'EXECUTING', 'SETTLED', 'FAILED', 'CANCELLED', 'EXPIRED'] },
          cursor: { type: 'string', description: 'Pagination cursor (last order ID from previous page)' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (req, reply) => {
    const schema = z.object({
      status: z.enum(['QUOTED', 'ACCEPTED', 'EXECUTING', 'SETTLED', 'FAILED', 'CANCELLED', 'EXPIRED']).optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    })

    const query = schema.parse(req.query)

    const orders = await prisma.otcOrder.findMany({
      where: {
        customerId: req.customerId,
        ...(query.status ? { status: query.status } : {}),
      },
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: query.limit,
      orderBy: { createdAt: 'desc' },
    })

    const nextCursor = orders.length === query.limit ? orders[orders.length - 1].id : null

    return reply.send({ success: true, data: orders, nextCursor })
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
