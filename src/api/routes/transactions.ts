import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/client.js'

const transactionsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /v1/transactions — list onramp + offramp orders
  fastify.get('/transactions', {
    schema: {
      tags: ['transactions'],
      summary: 'List all transactions (on-ramp, off-ramp, remittance) with optional filter',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['onramp', 'offramp', 'remittance', 'all'], default: 'all' },
          status: { type: 'string', description: 'Filter by order status' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          before: { type: 'string', description: 'Cursor for pagination (last order ID from previous page)' },
        },
      },
    },
  }, async (req, reply) => {
    const schema = z.object({
      type: z.enum(['onramp', 'offramp', 'remittance', 'all']).default('all'),
      status: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
      before: z.string().optional(), // cursor pagination
    })

    const query = schema.parse(req.query)
    const { type, status, limit, before } = query

    const cursor = before ? { id: before } : undefined

    const [onrampOrders, offrampOrders, remittanceOrders] = await Promise.all([
      type !== 'offramp' && type !== 'remittance'
        ? prisma.onrampOrder.findMany({
            where: {
              customerId: req.customerId,
              ...(status ? { status: status as never } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            ...(cursor ? { cursor, skip: 1 } : {}),
            include: { virtualAccount: true },
          })
        : [],
      type !== 'onramp' && type !== 'remittance'
        ? prisma.offrampOrder.findMany({
            where: {
              customerId: req.customerId,
              ...(status ? { status: status as never } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            ...(cursor ? { cursor, skip: 1 } : {}),
          })
        : [],
      type !== 'onramp' && type !== 'offramp'
        ? prisma.remittanceOrder.findMany({
            where: {
              customerId: req.customerId,
              ...(status ? { status: status as never } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            ...(cursor ? { cursor, skip: 1 } : {}),
          })
        : [],
    ])

    const items = [
      ...onrampOrders.map((o) => ({ type: 'onramp' as const, ...o })),
      ...offrampOrders.map((o) => ({ type: 'offramp' as const, ...o })),
      ...remittanceOrders.map((o) => ({ type: 'remittance' as const, ...o })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)

    const nextCursor = items.length === limit ? items[items.length - 1].id : undefined

    return reply.send({
      success: true,
      data: { items, nextCursor },
    })
  })
}

export default transactionsRoutes
