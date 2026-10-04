import { prisma } from '../db/client.js'
import { retryWebhookDelivery } from '../services/webhook/delivery.js'

const POLL_INTERVAL_MS = 60_000

export async function startWebhookRetryDaemon(): Promise<void> {
  console.log('[webhook-retry] Starting…')

  async function processRetries() {
    const now = new Date()

    const pending = await prisma.webhookDelivery.findMany({
      where: {
        succeededAt: null,
        failedAt: null,
        nextAttemptAt: { lte: now },
        attempts: { lt: 5 },
      },
      select: { id: true },
      take: 50,
    })

    for (const delivery of pending) {
      retryWebhookDelivery(delivery.id).catch((err: Error) =>
        console.error(`[webhook-retry] Delivery ${delivery.id} error:`, err.message)
      )
    }

    if (pending.length > 0) {
      console.log(`[webhook-retry] Queued ${pending.length} retries`)
    }
  }

  await processRetries()

  setInterval(() => {
    processRetries().catch((err) =>
      console.error('[webhook-retry] Error:', err)
    )
  }, POLL_INTERVAL_MS)
}
