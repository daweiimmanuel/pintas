import path from 'path'
import type { FastifyPluginAsync } from 'fastify'
import fastifyStatic from '@fastify/static'
import { config } from '../../config/index.js'

// Compiled output: dist/api/routes/app-bff.js → up 3 levels → project root → web/dist
// __dirname is available in CJS output (NodeNext without "type":"module")
const WEB_DIST = path.resolve(__dirname, '../../../web/dist')

const appBffRoutes: FastifyPluginAsync = async (fastify) => {
  // BFF: return demo session config so the API key stays server-side and out of the bundle
  fastify.get('/app/session', {
    config: { skipAuth: true },
    schema: {
      tags: ['sandbox'],
      summary: 'Get sandbox demo session credentials',
    },
  }, async (_req, reply) => {
    return reply.send({
      apiKey: config.DEMO_EXPORTER_API_KEY ?? 'pk_sandbox_demo_pt_contoh_ekspor',
      exporterId: 'exp_demo_pt_contoh',
      buyerId: 'buy_demo_acme_sg',
    })
  })

  // Serve built React app from web/dist/ under /app/ prefix.
  // serve: false means the plugin only decorates reply.sendFile without registering any routes,
  // so our explicit routes below control all serving with no conflicts.
  await fastify.register(fastifyStatic, {
    root: WEB_DIST,
    prefix: '/app/',
    serve: false,
    decorateReply: true,
  })

  // /app → redirect to /app/
  fastify.get('/app', { config: { skipAuth: true } }, (_req, reply) =>
    reply.redirect(301, '/app/')
  )

  // /app/ → serve SPA shell (HashRouter handles client-side routing)
  fastify.get('/app/', { config: { skipAuth: true } }, (_req, reply) =>
    reply.sendFile('index.html')
  )

  // /app/* → serve static assets (JS/CSS); unknown paths return index.html
  fastify.get('/app/*', { config: { skipAuth: true } }, (req, reply) => {
    const subPath = (req.params as { '*': string })['*']
    return reply.sendFile(subPath)
  })
}

export default appBffRoutes
