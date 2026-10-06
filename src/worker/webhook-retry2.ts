import crypto from 'crypto'
import { prisma } from '../db/client.js'

const MAX_ATTEMPTS = 7

// Retry failed WebhookDelivery2 entries with exponential backoff.
// Runs on an interval; called from worker/index.ts.
export async function retryFailedWebhooks(): Promise<void> {
  const due = await prisma.webhookDelivery2.findMany({
    where: {
      status: 'FAILED',
      nextAttemptAt: { lte: new Date() },
      attempt: { lt: MAX_ATTEMPTS },
    },
    include: { endpoint: true },
    take: 50,
  })

  for (const delivery of due) {
    const newAttempt = delivery.attempt + 1
    const body = JSON.stringify(delivery.payloadJson)
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const sig = crypto
      .createHmac('sha256', delivery.endpoint.secret)
      .update(`${timestamp}.${body}`)
      .digest('hex')

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5_000)
      const resp = await fetch(delivery.endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Pintas-Signature': `t=${timestamp},v1=${sig}`,
          'X-Pintas-Event': delivery.eventType,
        },
        body,
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const backoffMs = Math.pow(2, newAttempt) * 60_000  // 2^n minutes
      await prisma.webhookDelivery2.update({
        where: { id: delivery.id },
        data: {
          attempt: newAttempt,
          status: resp.ok ? 'DELIVERED' : 'FAILED',
          lastResponseCode: resp.status,
          nextAttemptAt: resp.ok ? null : new Date(Date.now() + backoffMs),
        },
      })
    } catch {
      const backoffMs = Math.pow(2, newAttempt) * 60_000
      await prisma.webhookDelivery2.update({
        where: { id: delivery.id },
        data: {
          attempt: newAttempt,
          status: newAttempt >= MAX_ATTEMPTS ? 'ABANDONED' : 'FAILED',
          nextAttemptAt: newAttempt >= MAX_ATTEMPTS ? null : new Date(Date.now() + backoffMs),
        },
      }).catch(() => {})
    }
  }
}

export async function startWebhookRetry2Daemon(intervalMs = 60_000): Promise<() => void> {
  const timer = setInterval(() => {
    retryFailedWebhooks().catch((err) => console.error('[webhook-retry2]', err))
  }, intervalMs)
  return () => clearInterval(timer)
}
