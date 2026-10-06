import crypto from 'crypto'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/client.js'
import type { WebhookEvent } from '../../types/index.js'

const VALID_EVENTS: readonly WebhookEvent[] = [
  'onramp.created', 'onramp.funded', 'onramp.completed', 'onramp.failed',
  'offramp.created', 'offramp.funded', 'offramp.completed', 'offramp.failed',
  'kyc.approved', 'kyc.rejected',
  'remittance.created', 'remittance.funded', 'remittance.completed', 'remittance.failed',
  'remittance.expired',
  'otc.accepted', 'otc.settled', 'otc.failed', 'otc.expired',
] as const

const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/webhooks
  fastify.post('/webhooks', {
    schema: {
      tags: ['webhooks'],
      summary: 'Subscribe to webhook events',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['url', 'events'],
        properties: {
          url: { type: 'string', format: 'uri', description: 'HTTPS endpoint to receive events' },
          events: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', enum: [
              'onramp.created', 'onramp.funded', 'onramp.completed', 'onramp.failed',
              'offramp.created', 'offramp.funded', 'offramp.completed', 'offramp.failed',
              'kyc.approved', 'kyc.rejected',
              'remittance.created', 'remittance.funded', 'remittance.completed', 'remittance.failed', 'remittance.expired',
              'otc.accepted', 'otc.settled', 'otc.failed', 'otc.expired',
            ]},
          },
        },
      },
    },
  }, async (req, reply) => {
    const schema = z.object({
      url: z.string().url().startsWith('https://'),
      events: z.array(z.enum(VALID_EVENTS as unknown as [string, ...string[]])).min(1),
    })

    const body = schema.parse(req.body)
    const secret = crypto.randomBytes(32).toString('hex')

    const webhook = await prisma.webhook.create({
      data: {
        customerId: req.customerId,
        url: body.url,
        events: body.events,
        secret,
        isActive: true,
      },
    })

    return reply.code(201).send({
      success: true,
      data: { ...webhook, secret },
    })
  })

  // GET /v1/webhooks
  fastify.get('/webhooks', async (req, reply) => {
    const webhooks = await prisma.webhook.findMany({
      where: { customerId: req.customerId },
      select: {
        id: true, url: true, events: true, isActive: true, createdAt: true,
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, event: true, attempts: true, succeededAt: true, failedAt: true, createdAt: true },
        },
      },
    })

    return reply.send({ success: true, data: webhooks })
  })

  // DELETE /v1/webhooks/:id
  fastify.delete<{ Params: { id: string } }>('/webhooks/:id', async (req, reply) => {
    const existing = await prisma.webhook.findFirst({
      where: { id: req.params.id, customerId: req.customerId },
    })

    if (!existing) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Webhook not found' },
      })
    }

    await prisma.webhook.update({
      where: { id: req.params.id },
      data: { isActive: false },
    })

    return reply.send({ success: true, data: null })
  })

  // GET /v1/webhooks/:id/deliveries
  fastify.get<{ Params: { id: string } }>('/webhooks/:id/deliveries', async (req, reply) => {
    const webhook = await prisma.webhook.findFirst({
      where: { id: req.params.id, customerId: req.customerId },
    })

    if (!webhook) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Webhook not found' },
      })
    }

    const deliveries = await prisma.webhookDelivery.findMany({
      where: { webhookId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return reply.send({ success: true, data: deliveries })
  })
}

export default webhookRoutes
