import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import * as service from './service.js'
import { parseCents } from '../../lib/money.js'

const quoteRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/quotes
  fastify.post('/quotes', {
    schema: {
      tags: ['settlements'],
      summary: 'Create a pricing quote for an invoice amount',
      body: {
        type: 'object',
        required: ['exporterId', 'invoiceAmountUsd'],
        properties: {
          exporterId:       { type: 'string' },
          invoiceAmountUsd: { type: 'string', description: 'Invoice amount in USD, e.g. "50000.00"' },
        },
      },
    },
  }, async (req, reply) => {
    const body = z.object({
      exporterId:       z.string(),
      invoiceAmountUsd: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid USD amount'),
    }).parse(req.body)

    const invoiceAmountCents = parseCents(body.invoiceAmountUsd)
    if (invoiceAmountCents <= 0n) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'invoiceAmountUsd must be positive' } })
    }

    const quote = await service.createQuote({ exporterId: body.exporterId, invoiceAmountCents })
    return reply.code(201).send({ success: true, data: quote })
  })

  // GET /v1/quotes/:id
  fastify.get('/quotes/:id', {
    schema: {
      tags: ['settlements'],
      summary: 'Get a quote by ID',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const quote = await service.getQuote(id)
    if (!quote) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Quote not found' } })
    return reply.send({ success: true, data: quote })
  })
}

export default quoteRoutes
