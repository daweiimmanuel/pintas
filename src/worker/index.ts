/**
 * Settlement worker — runs alongside (or instead of) the API server in always-on
 * deployments. Handles jobs that require persistent connections:
 *   1. Blockchain deposit watcher (Polygon ERC-20 Transfer events)
 *   2. Webhook retry daemon (re-sends failed deliveries on schedule)
 *   3. Expired order cleanup
 */
import { prisma } from '../db/client.js'
import { config } from '../config/index.js'
import { startDepositWatcher } from './deposit-watcher.js'
import { startWebhookRetryDaemon } from './webhook-retry.js'
import { startOrderExpiryJob } from './order-expiry.js'

async function main() {
  console.log('[worker] Starting Pintas settlement worker…')

  const jobs = await Promise.allSettled([
    startDepositWatcher(),
    startWebhookRetryDaemon(),
    startOrderExpiryJob(),
  ])

  for (const job of jobs) {
    if (job.status === 'rejected') {
      console.error('[worker] Job failed to start:', job.reason)
    }
  }

  console.log('[worker] All jobs running')

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} — shutting down`)
    await prisma.$disconnect()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('[worker] Fatal error:', err)
  process.exit(1)
})
