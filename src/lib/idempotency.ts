import crypto from 'crypto'
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { prisma } from '../db/client.js'

// Routes that require an Idempotency-Key header.
// Only resource-creation endpoints — state-machine transitions have their own idempotency.
const IDEMPOTENCY_ROUTES = new Set([
  '/v1/exporters',
  '/v1/buyers',
  '/v1/quotes',
  '/v1/settlements',
  '/v1/webhook-endpoints',
])

function requiresIdempotency(req: FastifyRequest): boolean {
  if (req.method !== 'POST') return false
  const path = req.url.split('?')[0]
  if (IDEMPOTENCY_ROUTES.has(path)) return true
  // Payout-account creation under an exporter
  if (/^\/v1\/exporters\/[^/]+\/payout-accounts$/.test(path)) return true
  return false
}

const idempotencyPlugin: FastifyPluginAsync = async (fastify) => {
  // preHandler fires after body parsing — body is available for hashing
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requiresIdempotency(request)) return

    const idempKey = request.headers['idempotency-key'] as string | undefined
    if (!idempKey) {
      return reply.code(400).send({
        success: false,
        error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key header is required for this endpoint' },
      })
    }

    const route = `${request.method}:${request.url.split('?')[0]}`
    const bodyStr = JSON.stringify(request.body ?? null)
    const requestHash = crypto.createHash('sha256').update(route + bodyStr).digest('hex')

    const existing = await prisma.idempotencyKey.findUnique({ where: { key: idempKey } })

    if (existing) {
      if (existing.requestHash !== requestHash) {
        return reply.code(422).send({
          success: false,
          error: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency-Key already used with a different request body' },
        })
      }
      if (existing.expiresAt > new Date()) {
        // Replay cached response
        const cached = existing.responseJson as { statusCode: number; body: unknown }
        return reply.code(cached.statusCode).send(cached.body)
      }
    }

    // Store key for onSend hook to persist the response
    request.idempotencyKey = idempKey
    request.idempotencyHash = requestHash
  })

  fastify.addHook('onSend', async (request: FastifyRequest, _reply: FastifyReply, payload: unknown) => {
    if (!request.idempotencyKey) return payload

    const statusCode = _reply.statusCode
    let body: unknown
    try {
      body = typeof payload === 'string' ? JSON.parse(payload) : payload
    } catch {
      body = payload
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h TTL
    await prisma.idempotencyKey.upsert({
      where: { key: request.idempotencyKey },
      create: {
        key: request.idempotencyKey,
        route: `${request.method}:${request.url.split('?')[0]}`,
        requestHash: request.idempotencyHash,
        responseJson: { statusCode, body } as object,
        expiresAt,
      },
      update: {
        responseJson: { statusCode, body } as object,
        expiresAt,
      },
    }).catch(() => {}) // non-blocking; best-effort

    return payload
  })
}

declare module 'fastify' {
  interface FastifyRequest {
    idempotencyKey?: string
    idempotencyHash: string
  }
}

export default fp(idempotencyPlugin, { name: 'idempotency' })
