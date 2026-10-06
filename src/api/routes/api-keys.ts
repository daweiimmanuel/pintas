import crypto from 'crypto'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/client.js'

const apiKeysRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/api-keys — create a new API key
  fastify.post('/api-keys', async (req, reply) => {
    const schema = z.object({
      name: z.string().min(1).max(100),
      scopes: z.array(z.string().min(1).max(64)).default(['*']),
      ipAllowlist: z.array(z.string().ip()).default([]),
      expiresAt: z.string().datetime().optional(),
    })

    const body = schema.parse(req.body)

    const rawKey = crypto.randomBytes(32).toString('hex')
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')

    const apiKey = await prisma.apiKey.create({
      data: {
        keyHash,
        name: body.name,
        scopes: body.scopes,
        ipAllowlist: body.ipAllowlist,
        customerId: req.customerId,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    })

    return reply.code(201).send({
      success: true,
      data: {
        id: apiKey.id,
        name: apiKey.name,
        scopes: apiKey.scopes,
        ipAllowlist: apiKey.ipAllowlist,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
        // Raw key returned ONCE — never stored, never returned again
        key: `pk_${rawKey}`,
      },
    })
  })

  // GET /v1/api-keys — list active keys (no keyHash)
  fastify.get('/api-keys', async (req, reply) => {
    const apiKeys = await prisma.apiKey.findMany({
      where: { customerId: req.customerId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        scopes: true,
        ipAllowlist: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    })

    return reply.send({ success: true, data: apiKeys })
  })

  // DELETE /v1/api-keys/:id — revoke a key
  fastify.delete<{ Params: { id: string } }>('/api-keys/:id', async (req, reply) => {
    const { id } = req.params

    // Prevent revoking the key that's currently in use
    if (id === req.apiKeyId) {
      return reply.code(400).send({
        success: false,
        error: { code: 'SELF_REVOCATION', message: 'Cannot revoke the API key used in this request' },
      })
    }

    const existing = await prisma.apiKey.findFirst({
      where: { id, customerId: req.customerId, revokedAt: null },
    })

    if (!existing) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'API key not found' },
      })
    }

    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    })

    return reply.send({ success: true, data: { id, revokedAt: new Date() } })
  })
}

export default apiKeysRoutes
