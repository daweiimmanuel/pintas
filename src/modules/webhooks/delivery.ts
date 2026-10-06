import crypto from 'crypto'
import { prisma } from '../../db/client.js'

export type SettlementEventType =
  | 'settlement.awaiting_funds'
  | 'settlement.payment_received'
  | 'settlement.funded'
  | 'settlement.in_transit'
  | 'settlement.paid_out'
  | 'settlement.reconciled'
  | 'settlement.failed'
  | 'settlement.refunded'
  | 'settlement.expired'

export interface WebhookPayload {
  event: SettlementEventType
  orderId: string
  status: string
  timestamp: string
  data?: Record<string, unknown>
}

// Dispatch a settlement webhook to all active endpoints for the exporter.
// Fire-and-forget — errors are logged but do not fail the caller.
export async function dispatchSettlementWebhook(
  exporterId: string,
  event: SettlementEventType,
  payload: WebhookPayload,
): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { exporterId, active: true, events: { has: event } },
  })

  for (const endpoint of endpoints) {
    const bodyJson = JSON.stringify(payload)
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const sig = crypto
      .createHmac('sha256', endpoint.secret)
      .update(`${timestamp}.${bodyJson}`)
      .digest('hex')

    await prisma.webhookDelivery2.create({
      data: {
        endpointId: endpoint.id,
        eventType: event,
        payloadJson: payload as object,
        attempt: 1,
        nextAttemptAt: new Date(),
        status: 'PENDING',
      },
    }).catch(() => {})

    // Best-effort immediate delivery
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5_000)
      const resp = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Pintas-Signature': `t=${timestamp},v1=${sig}`,
          'X-Pintas-Event': event,
        },
        body: bodyJson,
        signal: controller.signal,
      })
      clearTimeout(timeout)

      await prisma.webhookDelivery2.updateMany({
        where: { endpointId: endpoint.id, eventType: event, status: 'PENDING' },
        data: {
          status: resp.ok ? 'DELIVERED' : 'FAILED',
          lastResponseCode: resp.status,
          nextAttemptAt: resp.ok ? null : new Date(Date.now() + 60_000),
        },
      })
    } catch {
      await prisma.webhookDelivery2.updateMany({
        where: { endpointId: endpoint.id, eventType: event, status: 'PENDING' },
        data: { status: 'FAILED', nextAttemptAt: new Date(Date.now() + 60_000) },
      }).catch(() => {})
    }
  }
}
