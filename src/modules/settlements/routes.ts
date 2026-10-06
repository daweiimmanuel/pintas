import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import * as service from './service.js'
import { transition, InvalidTransitionError } from './state-machine.js'

const settlementRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/settlements — create from a quote
  fastify.post('/settlements', {
    schema: {
      tags: ['settlements'],
      summary: 'Create a settlement order from a quote',
      body: {
        type: 'object',
        required: ['exporterId', 'buyerId', 'quoteId', 'invoiceRef'],
        properties: {
          exporterId:  { type: 'string' },
          buyerId:     { type: 'string' },
          quoteId:     { type: 'string' },
          invoiceRef:  { type: 'string', description: 'Exporter invoice reference number' },
        },
      },
    },
  }, async (req, reply) => {
    const body = z.object({
      exporterId: z.string(),
      buyerId:    z.string(),
      quoteId:    z.string(),
      invoiceRef: z.string().min(1),
    }).parse(req.body)

    try {
      const order = await service.createSettlement(body)
      return reply.code(201).send({ success: true, data: order })
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('No Quote found')) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Quote not found' } })
      }
      throw err
    }
  })

  // GET /v1/settlements/:id
  fastify.get('/settlements/:id', {
    schema: {
      tags: ['settlements'],
      summary: 'Get a settlement order',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const order = await service.getSettlement(id)
    if (!order) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Settlement not found' } })
    return reply.send({ success: true, data: order })
  })

  // GET /v1/settlements/:id/events
  fastify.get('/settlements/:id/events', {
    schema: {
      tags: ['settlements'],
      summary: 'Get status transition history for a settlement order',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const events = await service.getOrderEvents(id)
    return reply.send({ success: true, data: events })
  })

  // POST /v1/settlements/:id/cancel
  fastify.post('/settlements/:id/cancel', {
    schema: {
      tags: ['settlements'],
      summary: 'Cancel a settlement order (DRAFT or AWAITING_FUNDS only, before any funds)',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    try {
      const order = await transition(id, 'CANCELLED', { trigger: 'api.cancel', actor: req.customerId || 'unknown' })
      return reply.send({ success: true, data: { id: order.id, status: order.status } })
    } catch (err: unknown) {
      if (err instanceof InvalidTransitionError) {
        return reply.code(409).send({ success: false, error: { code: 'INVALID_TRANSITION', message: err.message } })
      }
      throw err
    }
  })
}

export default settlementRoutes
