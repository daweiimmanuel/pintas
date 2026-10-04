import { prisma } from '../db/client.js'
import { watchPolygonDeposit } from '../services/blockchain/index.js'
import { handleOnchainDeposit } from '../services/settlement/offramp.js'
import { Stablecoin, Chain } from '../types/index.js'

const POLL_INTERVAL_MS = 30_000
const CHAINS_TO_WATCH = [Chain.POLYGON] as const

export async function startDepositWatcher(): Promise<void> {
  console.log('[deposit-watcher] Starting…')

  // Poll for new PENDING off-ramp orders and watch their deposit addresses
  const watchedAddresses = new Set<string>()

  async function scanAndWatch() {
    const pendingOrders = await prisma.offrampOrder.findMany({
      where: { status: 'PENDING' },
      select: {
        id: true,
        depositAddress: true,
        amountStablecoin: true,
        stablecoin: true,
        chain: true,
      },
    })

    for (const order of pendingOrders) {
      if (watchedAddresses.has(order.depositAddress)) continue
      if (!CHAINS_TO_WATCH.includes(order.chain as typeof CHAINS_TO_WATCH[number])) continue

      watchedAddresses.add(order.depositAddress)
      console.log(`[deposit-watcher] Watching ${order.depositAddress} for order ${order.id}`)

      watchPolygonDeposit({
        address: order.depositAddress,
        stablecoin: order.stablecoin as Stablecoin,
        minAmount: order.amountStablecoin.toString(),
        onDeposit: async (result) => {
          watchedAddresses.delete(order.depositAddress)
          await handleOnchainDeposit(
            order.depositAddress,
            result.txHash,
            result.amount
          )
        },
        timeoutMs: 3_600_000, // 1 hour
      }).catch((err: Error) => {
        watchedAddresses.delete(order.depositAddress)
        if (!err.message.includes('timed out')) {
          console.error(`[deposit-watcher] Error watching ${order.depositAddress}:`, err.message)
        }
      })
    }
  }

  // Initial scan
  await scanAndWatch()

  // Recurring scan for newly created orders
  setInterval(() => {
    scanAndWatch().catch((err) =>
      console.error('[deposit-watcher] Scan error:', err)
    )
  }, POLL_INTERVAL_MS)
}
