import crypto from 'crypto'
import type { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { prisma } from '../../db/client.js'

declare module 'fastify' {
  interface FastifyRequest {
    customerId: string
    apiKeyId: string
    keyScopes: string[]
  }
  interface FastifyInstance {
    requireScope: (scope: string) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('customerId', '')
  fastify.decorateRequest('apiKeyId', '')
  fastify.decorateRequest('keyScopes', null as unknown as string[])

  fastify.decorate(
    'requireScope',
    (scope: string) =>
      async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
        const scopes: string[] = req.keyScopes ?? []
        if (!scopes.includes('*') && !scopes.includes(scope)) {
          return reply.code(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: `Scope '${scope}' required` },
          })
        }
      }
  )

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for health check and callback routes
    const { url } = request
    if (
      url === '/health' ||
      url.startsWith('/v1/callbacks/') ||
      url.startsWith('/v1/sandbox/') ||
      url.startsWith('/docs') ||
      url.startsWith('/documentation') ||
      url === '/v1/auth/register'
    ) return

    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token' },
      })
    }

    const rawKey = authHeader.slice(7)
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { customer: true },
    })

    if (!apiKey || apiKey.revokedAt) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
      })
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'API key expired' },
      })
    }

    // IP allowlist check
    if (apiKey.ipAllowlist.length > 0) {
      const clientIp = request.ip
      if (!apiKey.ipAllowlist.includes(clientIp)) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'IP not in allowlist' },
        })
      }
    }

    request.customerId = apiKey.customerId
    request.apiKeyId = apiKey.id
    request.keyScopes = apiKey.scopes

    // Update lastUsedAt async (non-blocking)
    prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {})
  })
}

export default fp(authPlugin, { name: 'auth' })
