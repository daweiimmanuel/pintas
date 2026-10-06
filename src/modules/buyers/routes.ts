import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import * as service from './service.js'

const buyerRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/buyers
  fastify.post('/buyers', {
    schema: {
      tags: ['exporters'],
      summary: 'Register a buyer (foreign company paying the exporter)',
      body: {
        type: 'object',
        required: ['exporterId', 'legalName', 'country', 'email'],
        properties: {
          exporterId: { type: 'string' },
          legalName:  { type: 'string', minLength: 2, maxLength: 200 },
          country:    { type: 'string', minLength: 2, maxLength: 2, description: 'ISO 3166-1 alpha-2 country code' },
          email:      { type: 'string', format: 'email' },
        },
      },
    },
  }, async (req, reply) => {
    const body = z.object({
      exporterId: z.string(),
      legalName:  z.string().min(2).max(200),
      country:    z.string().length(2),
      email:      z.string().email(),
    }).parse(req.body)

    const buyer = await service.createBuyer(body)
    return reply.code(201).send({ success: true, data: buyer })
  })

  // GET /v1/buyers/:id
  fastify.get('/buyers/:id', {
    schema: {
      tags: ['exporters'],
      summary: 'Get a buyer by ID',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const buyer = await service.getBuyer(id)
    if (!buyer) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Buyer not found' } })
    return reply.send({ success: true, data: buyer })
  })
}

export default buyerRoutes
