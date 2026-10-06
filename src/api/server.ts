import Fastify from 'fastify'
import fp from 'fastify-plugin'
import { config } from '../config/index.js'
import authPlugin from './middleware/auth.js'
import errorPlugin from './middleware/errors.js'
import ratesRoutes from './routes/rates.js'
import onrampRoutes from './routes/onramp.js'
import offrampRoutes from './routes/offramp.js'
import transactionsRoutes from './routes/transactions.js'
import kycRoutes from './routes/kyc.js'
import webhookRoutes from './routes/webhooks.js'
import { corridorRoutes } from './routes/corridor.js'
import otcRoutes from './routes/otc.js'
import walletsRoutes from './routes/wallets.js'

export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        config.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z' } }
          : undefined,
    },
    trustProxy: true,
  })

  // Rate limiting
  await fastify.register(
    fp(async (f) => {
      // Dynamic import so the server still builds without @fastify/rate-limit in dev
      try {
        const rl = await import('@fastify/rate-limit')
        await f.register(rl.default, {
          max: config.RATE_LIMIT_MAX,
          timeWindow: config.RATE_LIMIT_WINDOW_MS,
          keyGenerator: (req) => req.customerId || req.ip,
        })
      } catch {
        // @fastify/rate-limit not installed: skip
      }
    })
  )

  // Middleware plugins
  await fastify.register(errorPlugin)
  await fastify.register(authPlugin)

  // Health check (no auth required)
  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
  }))

  // API v1 routes
  await fastify.register(
    async (v1) => {
      await v1.register(ratesRoutes)
      await v1.register(onrampRoutes)
      await v1.register(offrampRoutes)
      await v1.register(transactionsRoutes)
      await v1.register(kycRoutes)
      await v1.register(webhookRoutes)
      await v1.register(corridorRoutes)
      await v1.register(otcRoutes)
      await v1.register(walletsRoutes)
    },
    { prefix: '/v1' }
  )

  return fastify
}
