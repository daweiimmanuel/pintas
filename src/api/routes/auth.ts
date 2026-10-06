import crypto from 'crypto'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/client.js'
import { config } from '../../config/index.js'

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/auth/register — provision a new customer + initial API key
  // Protected by MASTER_API_KEY_SECRET (passed as Bearer token)
  fastify.post('/auth/register', {
    config: { skipAuth: true },
    schema: {
      tags: ['auth'],
      summary: 'Register a new customer and receive an initial API key',
      security: [{ masterKey: [] }],
      body: {
        type: 'object',
        required: ['name', 'email'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100, description: 'Company or individual name' },
          email: { type: 'string', format: 'email', description: 'Contact email' },
        },
      },
    },
  }, async (req, reply) => {
    // Validate master key
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Master key required' } })
    }
    if (auth.slice(7) !== config.MASTER_API_KEY_SECRET) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid master key' } })
    }

    const body = z.object({
      name: z.string().min(2).max(100),
      email: z.string().email(),
    }).parse(req.body)

    const existing = await prisma.customer.findFirst({ where: { email: body.email } })
    if (existing) {
      return reply.code(409).send({ success: false, error: { code: 'EMAIL_TAKEN', message: 'A customer with this email already exists' } })
    }

    const customer = await prisma.customer.create({
      data: { name: body.name, email: body.email, kybStatus: 'PENDING', tier: 'TIER1' },
    })

    const rawKey = crypto.randomBytes(32).toString('hex')
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')

    const apiKey = await prisma.apiKey.create({
      data: {
        keyHash,
        name: 'Default Key',
        scopes: ['*'],
        ipAllowlist: [],
        customerId: customer.id,
        expiresAt: null,
      },
    })

    return reply.code(201).send({
      success: true,
      data: {
        customerId: customer.id,
        email: customer.email,
        apiKey: {
          id: apiKey.id,
          key: `pk_${rawKey}`,
          scopes: apiKey.scopes,
        },
        message: 'Save the API key — it will not be shown again.',
      },
    })
  })
}

export default authRoutes
