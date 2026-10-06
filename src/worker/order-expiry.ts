import { prisma } from '../db/client.js'
import { dispatchWebhookEvent } from '../services/webhook/delivery.js'

const POLL_INTERVAL_MS = 300_000 // 5 min
const ONRAMP_EXPIRY_MINUTES = 30
const OFFRAMP_EXPIRY_MINUTES = 60

export async function startOrderExpiryJob(): Promise<void> {
  console.log('[order-expiry] Starting…')

  async function expireOrders() {
    const now = new Date()
    const onrampCutoff = new Date(now.getTime() - ONRAMP_EXPIRY_MINUTES * 60_000)
    const offrampCutoff = new Date(now.getTime() - OFFRAMP_EXPIRY_MINUTES * 60_000)

    // Expire onramp + offramp (time-based cutoff)
    const [expiredOnramp, expiredOfframp] = await Promise.all([
      prisma.onrampOrder.updateMany({
        where: { status: 'PENDING', createdAt: { lt: onrampCutoff } },
        data: { status: 'EXPIRED' },
      }),
      prisma.offrampOrder.updateMany({
        where: { status: 'PENDING', createdAt: { lt: offrampCutoff } },
        data: { status: 'EXPIRED' },
      }),
    ])

    // Expire OTC quotes (use expiresAt field — 30s TTL from quote time)
    const expiredOtcRows = await prisma.otcOrder.findMany({
      where: { status: 'QUOTED', expiresAt: { lt: now } },
      select: { id: true, customerId: true },
    })
    if (expiredOtcRows.length > 0) {
      await prisma.otcOrder.updateMany({
        where: { id: { in: expiredOtcRows.map((r) => r.id) } },
        data: { status: 'EXPIRED' },
      })
      await Promise.allSettled(
        expiredOtcRows.map((r) =>
          dispatchWebhookEvent(r.customerId, 'otc.expired', { orderId: r.id })
        )
      )
    }

    // Expire remittance orders (use expiresAt field)
    const expiredRemittanceRows = await prisma.remittanceOrder.findMany({
      where: { status: 'PENDING', expiresAt: { lt: now } },
      select: { id: true, customerId: true },
    })
    if (expiredRemittanceRows.length > 0) {
      await prisma.remittanceOrder.updateMany({
        where: { id: { in: expiredRemittanceRows.map((r) => r.id) } },
        data: { status: 'EXPIRED' },
      })
      await Promise.allSettled(
        expiredRemittanceRows.map((r) =>
          dispatchWebhookEvent(r.customerId, 'remittance.expired', { remittanceId: r.id })
        )
      )
    }

    const total =
      expiredOnramp.count +
      expiredOfframp.count +
      expiredOtcRows.length +
      expiredRemittanceRows.length

    if (total > 0) {
      console.log(
        `[order-expiry] Expired ${expiredOnramp.count} onramp, ${expiredOfframp.count} offramp, ` +
          `${expiredOtcRows.length} OTC, ${expiredRemittanceRows.length} remittance`
      )
    }
  }

  await expireOrders()

  setInterval(() => {
    expireOrders().catch((err) => console.error('[order-expiry] Error:', err))
  }, POLL_INTERVAL_MS)
}
