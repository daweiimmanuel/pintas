import crypto from 'crypto'
import axios from 'axios'
import { prisma } from '../../db/client.js'
import { config } from '../../config/index.js'
import type { WebhookEvent, WebhookPayload } from '../../types/index.js'

const MAX_ATTEMPTS = 5
const BACKOFF_BASE_MS = 1000

function backoffMs(attempt: number): number {
  return BACKOFF_BASE_MS * Math.pow(2, attempt - 1)
}

function signPayload(payload: string): string {
  return crypto
    .createHmac('sha256', config.WEBHOOK_SIGNING_SECRET)
    .update(payload)
    .digest('hex')
}

export async function dispatchWebhookEvent(
  customerId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
  opts?: { onrampOrderId?: string; offrampOrderId?: string }
): Promise<void> {
  const webhooks = await prisma.webhook.findMany({
    where: { customerId, events: { has: event }, isActive: true },
  })

  if (webhooks.length === 0) return

  const payload: WebhookPayload = {
    id: crypto.randomUUID(),
    event,
    data,
    timestamp: new Date().toISOString(),
  }
  const payloadStr = JSON.stringify(payload)
  const signature = signPayload(payloadStr)

  await Promise.all(
    webhooks.map((wh) =>
      deliverWebhook({
        webhookId: wh.id,
        url: wh.url,
        event,
        payload,
        payloadStr,
        signature,
        attempt: 1,
        onrampOrderId: opts?.onrampOrderId,
        offrampOrderId: opts?.offrampOrderId,
      })
    )
  )
}

export async function retryWebhookDelivery(deliveryId: string): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUniqueOrThrow({
    where: { id: deliveryId },
    include: { webhook: true },
  })

  const payload = delivery.payload as unknown as WebhookPayload
  const payloadStr = JSON.stringify(payload)
  const signature = signPayload(payloadStr)

  await deliverWebhook({
    webhookId: delivery.webhookId,
    url: delivery.webhook.url,
    event: delivery.event as WebhookEvent,
    payload,
    payloadStr,
    signature,
    attempt: delivery.attempts + 1,
    deliveryId: delivery.id,
  })
}

export async function deliverWebhook(params: {
  webhookId: string
  url: string
  event: WebhookEvent
  payload: WebhookPayload
  payloadStr: string
  signature: string
  attempt: number
  deliveryId?: string
  onrampOrderId?: string
  offrampOrderId?: string
}): Promise<void> {
  const { webhookId, url, event, payload, payloadStr, signature, attempt } = params

  // Create or reuse the delivery record
  const delivery = params.deliveryId
    ? await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: params.deliveryId } })
    : await prisma.webhookDelivery.create({
        data: {
          webhookId,
          event,
          payload: payload as object,
          onrampOrderId: params.onrampOrderId,
          offrampOrderId: params.offrampOrderId,
        },
      })

  try {
    const res = await axios.post(url, payloadStr, {
      headers: {
        'Content-Type': 'application/json',
        'X-Pintas-Signature': `sha256=${signature}`,
        'X-Pintas-Delivery': delivery.id,
      },
      timeout: 10000,
    })

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attempts: attempt,
        lastAttemptAt: new Date(),
        succeededAt: new Date(),
        lastStatusCode: res.status,
        lastResponse: JSON.stringify(res.data).slice(0, 1000),
        nextAttemptAt: null,
      },
    })
  } catch (err: unknown) {
    const statusCode = axios.isAxiosError(err) ? err.response?.status : undefined
    const errMessage = err instanceof Error ? err.message : String(err)

    const nextAttempt = attempt + 1
    const willRetry = attempt < MAX_ATTEMPTS

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attempts: attempt,
        lastAttemptAt: new Date(),
        lastStatusCode: statusCode,
        lastResponse: errMessage.slice(0, 1000),
        failedAt: willRetry ? null : new Date(),
        nextAttemptAt: willRetry
          ? new Date(Date.now() + backoffMs(nextAttempt))
          : null,
      },
    })

    if (willRetry) {
      setTimeout(
        () =>
          deliverWebhook({
            ...params,
            attempt: nextAttempt,
            deliveryId: delivery.id,
          }),
        backoffMs(nextAttempt)
      )
    }
  }
}
