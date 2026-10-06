import { prisma } from '../db/client.js'
import { handleDisbursementCallback } from '../services/settlement/offramp.js'
import { checkDisbursementStatus } from '../services/disbursement/index.js'

// Poll DurianPay every 5 minutes for DISBURSING orders older than 10 minutes.
// Guards against lost webhooks — if DurianPay fires but our endpoint was down,
// the order stays stuck in DISBURSING indefinitely without this poller.

const POLL_INTERVAL_MS = 5 * 60_000
const STALE_THRESHOLD_MS = 10 * 60_000

async function pollStuckDisbursements(): Promise<void> {
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS)

  const stuck = await prisma.offrampOrder.findMany({
    where: {
      status: 'DISBURSING',
      updatedAt: { lt: staleThreshold },
    },
    select: { id: true, disbursementId: true },
    take: 50,
  })

  if (stuck.length === 0) return

  console.log(`[disbursement-poller] Checking ${stuck.length} stuck disbursement(s)`)

  await Promise.allSettled(
    stuck.map(async (order) => {
      try {
        const status = await checkDisbursementStatus(order.disbursementId ?? order.id)
        if (status === 'completed') {
          await handleDisbursementCallback(order.disbursementId ?? order.id, 'completed')
        } else if (status === 'failed') {
          await handleDisbursementCallback(order.disbursementId ?? order.id, 'failed')
        }
        // 'processing' — still in-flight, check again next cycle
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[disbursement-poller] Status check failed for order ${order.id}: ${msg}`)
      }
    })
  )
}

export function startDisbursementPoller(): void {
  const run = () => pollStuckDisbursements().catch((err) =>
    console.error('[disbursement-poller] Poll cycle failed:', err)
  )

  setTimeout(run, 30_000)
  setInterval(run, POLL_INTERVAL_MS)

  console.log(`[disbursement-poller] Started — polling every ${POLL_INTERVAL_MS / 60_000} min`)
}
