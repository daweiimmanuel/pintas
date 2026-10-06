import crypto from 'crypto'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/client.js'

const VALID_EVENTS = [
  'settlement.awaiting_funds', 'settlement.payment_received', 'settlement.funded',
  'settlement.in_transit', 'settlement.paid_out', 'settlement.reconciled',
  'settlement.failed', 'settlement.refunded', 'settlement.expired',
] as const

const webhookEndpointRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/webhook-endpoints', {
    schema: {
      tags: ['settlements'],
      summary: 'Register a webhook endpoint for settlement events',
      body: {
        type: 'object',
        required: ['exporterId', 'url', 'events'],
        properties: {
          exporterId: { type: 'string' },
          url:        { type: 'string', format: 'uri' },
          events:     { type: 'array', items: { type: 'string' }, minItems: 1 },
        },
      },
    },
  }, async (req, reply) => {
    const body = z.object({
      exporterId: z.string(),
      url:        z.string().url(),
      events:     z.array(z.enum(VALID_EVENTS)).min(1),
    }).parse(req.body)

    const secret = crypto.randomBytes(32).toString('hex')
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        exporterId: body.exporterId,
        url: body.url,
        secret,
        events: body.events,
      },
      select: { id: true, exporterId: true, url: true, events: true, active: true, createdAt: true },
    })

    return reply.code(201).send({
      success: true,
      data: { ...endpoint, secret, note: 'Save the secret — it will not be shown again.' },
    })
  })
}

export default webhookEndpointRoutes
