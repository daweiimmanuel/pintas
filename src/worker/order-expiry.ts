import { prisma } from '../db/client.js'

const POLL_INTERVAL_MS = 300_000 // 5 min
const ONRAMP_EXPIRY_MINUTES = 30
const OFFRAMP_EXPIRY_MINUTES = 60

export async function startOrderExpiryJob(): Promise<void> {
  console.log('[order-expiry] Starting…')

  async function expireOrders() {
    const now = new Date()
    const onrampCutoff = new Date(now.getTime() - ONRAMP_EXPIRY_MINUTES * 60_000)
    const offrampCutoff = new Date(now.getTime() - OFFRAMP_EXPIRY_MINUTES * 60_000)

    const [expiredOnramp, expiredOfframp] = await Promise.all([
      prisma.onrampOrder.updateMany({
        where: {
          status: 'PENDING',
          createdAt: { lt: onrampCutoff },
        },
        data: { status: 'EXPIRED' },
      }),
      prisma.offrampOrder.updateMany({
        where: {
          status: 'PENDING',
          createdAt: { lt: offrampCutoff },
        },
        data: { status: 'EXPIRED' },
      }),
    ])

    const total = expiredOnramp.count + expiredOfframp.count
    if (total > 0) {
      console.log(
        `[order-expiry] Expired ${expiredOnramp.count} onramp + ${expiredOfframp.count} offramp orders`
      )
    }
  }

  await expireOrders()

  setInterval(() => {
    expireOrders().catch((err) =>
      console.error('[order-expiry] Error:', err)
    )
  }, POLL_INTERVAL_MS)
}
