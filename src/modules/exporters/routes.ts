import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import * as service from './service.js'

const exporterRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/exporters
  fastify.post('/exporters', {
    schema: {
      tags: ['exporters'],
      summary: 'Register a new exporter',
      body: {
        type: 'object',
        required: ['legalName', 'nib', 'npwp'],
        properties: {
          legalName: { type: 'string', minLength: 2, maxLength: 200 },
          nib:       { type: 'string', minLength: 13, maxLength: 13, description: '13-digit NIB business registration number' },
          npwp:      { type: 'string', minLength: 15, maxLength: 20, description: 'NPWP tax identification number' },
          country:   { type: 'string', minLength: 2, maxLength: 2 },
        },
      },
    },
  }, async (req, reply) => {
    const body = z.object({
      legalName: z.string().min(2).max(200),
      nib:       z.string().length(13),
      npwp:      z.string().min(15).max(20),
      country:   z.string().length(2).optional(),
    }).parse(req.body)

    const exporter = await service.createExporter(body)
    return reply.code(201).send({ success: true, data: exporter })
  })

  // POST /v1/exporters/:id/kyb — mock KYB: immediately approves
  fastify.post('/exporters/:id/kyb', {
    schema: {
      tags: ['exporters'],
      summary: 'Submit KYB (sandbox: auto-approved)',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const exporter = await service.getExporter(id)
    if (!exporter) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Exporter not found' } })
    await service.approveKyb(id)
    return reply.send({ success: true, data: { exporterId: id, kybStatus: 'APPROVED' } })
  })

  // POST /v1/exporters/:id/payout-accounts
  fastify.post('/exporters/:id/payout-accounts', {
    schema: {
      tags: ['exporters'],
      summary: 'Add a USD payout account',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['type', 'bankName', 'accountNumber', 'accountRef'],
        properties: {
          type:          { type: 'string', enum: ['OFFSHORE_USD', 'ID_BANK_USD'] },
          bankName:      { type: 'string', minLength: 1, maxLength: 100 },
          accountNumber: { type: 'string', minLength: 4, maxLength: 30, description: 'Raw account number; stored masked (last 4 only)' },
          accountRef:    { type: 'string', description: 'Provider tokenized account reference' },
          currency:      { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const body = z.object({
      type:          z.enum(['OFFSHORE_USD', 'ID_BANK_USD']),
      bankName:      z.string().min(1).max(100),
      accountNumber: z.string().min(4).max(30),
      accountRef:    z.string(),
      currency:      z.string().optional(),
    }).parse(req.body)

    const exporter = await service.getExporter(id)
    if (!exporter) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Exporter not found' } })

    const account = await service.createPayoutAccount({ exporterId: id, ...body })
    return reply.code(201).send({ success: true, data: account })
  })

  // GET /v1/exporters/:id/payout-accounts
  fastify.get('/exporters/:id/payout-accounts', {
    schema: {
      tags: ['exporters'],
      summary: 'List payout accounts for an exporter',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const accounts = await service.listPayoutAccounts(id)
    return reply.send({ success: true, data: accounts })
  })
}

export default exporterRoutes
