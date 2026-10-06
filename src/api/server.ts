import Fastify from 'fastify'
import fp from 'fastify-plugin'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import fastifyWebSocket from '@fastify/websocket'
import { config } from '../config/index.js'
import authPlugin from './middleware/auth.js'
import errorPlugin from './middleware/errors.js'
import ratesRoutes from './routes/rates.js'
import onrampRoutes from './routes/onramp.js'
import offrampRoutes from './routes/offramp.js'
import transactionsRoutes from './routes/transactions.js'
import kycRoutes from './routes/kyc.js'
import webhookRoutes from './routes/webhooks.js'
import otcRoutes from './routes/otc.js'
import walletsRoutes from './routes/wallets.js'
import apiKeysRoutes from './routes/api-keys.js'
import meRoutes from './routes/me.js'
import adminRoutes from './routes/admin.js'
import authRoutes from './routes/auth.js'
import exporterRoutes from '../modules/exporters/routes.js'
import buyerRoutes from '../modules/buyers/routes.js'
import quoteRoutes from '../modules/quotes/routes.js'
import settlementRoutes from '../modules/settlements/routes.js'
import sandboxRoutes from './routes/sandbox.js'
import webhookEndpointRoutes from '../modules/webhooks/routes.js'
import providerCallbackRoutes from './routes/provider-callbacks.js'
import idempotencyPlugin from '../lib/idempotency.js'
import appBffRoutes from './routes/app-bff.js'

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

  // OpenAPI / Swagger
  await fastify.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Pintas API',
        description: "Indonesia's stablecoin payment infrastructure (IDR ↔ USDT/USDC)",
        version: '1.0.0',
        contact: { name: 'Pintas Support', url: 'https://pintas.id' },
      },
      tags: [
        { name: 'auth', description: 'Customer registration and authentication' },
      { name: 'rates', description: 'Exchange rates and quotes' },
        { name: 'onramp', description: 'IDR → stablecoin' },
        { name: 'offramp', description: 'Stablecoin → IDR' },
        { name: 'otc', description: 'OTC desk (min IDR 75M)' },
        { name: 'kyc', description: 'Identity verification' },
        { name: 'wallets', description: 'Custody wallet addresses' },
        { name: 'webhooks', description: 'Event subscriptions' },
        { name: 'api-keys', description: 'API key management' },
        { name: 'transactions', description: 'Unified transaction history' },
        { name: 'me', description: 'Customer profile' },
        { name: 'admin', description: 'Internal admin operations (requires admin:write scope)' },
        { name: 'exporters', description: 'Exporter settlement — exporters, buyers, payout accounts' },
        { name: 'settlements', description: 'Exporter settlement orders and state machine' },
        { name: 'sandbox', description: 'Sandbox simulation endpoints (sandbox env only)' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'API key' },
          masterKey: { type: 'http', scheme: 'bearer', bearerFormat: 'Master API key secret' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  })
  await fastify.register(fastifySwaggerUi, { routePrefix: '/docs' })

  // WebSocket support
  await fastify.register(fastifyWebSocket)

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
  await fastify.register(idempotencyPlugin)

  // App dashboard (sandbox demo) — served outside /v1 prefix
  await fastify.register(appBffRoutes)

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
      await v1.register(otcRoutes)
      await v1.register(walletsRoutes)
      await v1.register(apiKeysRoutes)
      await v1.register(meRoutes)
      await v1.register(authRoutes)
      await v1.register(adminRoutes)
      await v1.register(exporterRoutes)
      await v1.register(buyerRoutes)
      await v1.register(quoteRoutes)
      await v1.register(settlementRoutes)
      if (config.APP_ENV === 'sandbox' || config.NODE_ENV !== 'production') {
        await v1.register(sandboxRoutes)
      }
      await v1.register(webhookEndpointRoutes)
      await v1.register(providerCallbackRoutes)
    },
    { prefix: '/v1' }
  )

  return fastify
}
