import { buildServer } from './api/server.js'
import { config } from './config/index.js'
import { prisma } from './db/client.js'

async function main() {
  const server = await buildServer()

  const shutdown = async (signal: string) => {
    server.log.info(`Received ${signal}, shutting down gracefully`)
    await server.close()
    await prisma.$disconnect()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  try {
    await server.listen({ port: config.PORT, host: config.HOST })
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

main()
