import type { VercelRequest, VercelResponse } from '@vercel/node'
import { buildServer } from '../src/api/server.js'
import type { FastifyInstance } from 'fastify'

// Reuse the server instance across warm invocations
let server: FastifyInstance | null = null

async function getServer(): Promise<FastifyInstance> {
  if (!server) {
    server = await buildServer()
    await server.ready()
  }
  return server
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await getServer()
  // Fastify can handle Node's IncomingMessage/ServerResponse directly
  app.server.emit('request', req, res)
}
