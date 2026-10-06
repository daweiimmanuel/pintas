import crypto from 'crypto'
import axios from 'axios'
import { config } from '../../config/index.js'
import { Chain, Stablecoin } from '../../types/index.js'
import type { TransferResult } from '../../types/index.js'

const TRON_USDT_DECIMALS = 6

async function getTronWeb() {
  const { TronWeb } = await import('tronweb')
  return new TronWeb({
    fullHost: config.TRON_API_URL,
    headers: config.TRON_API_KEY ? { 'TRON-PRO-API-KEY': config.TRON_API_KEY } : {},
    privateKey: config.TRON_WALLET_PRIVATE_KEY,
  })
}

export async function sendTronUsdt(params: {
  to: string
  amount: string
  stablecoin?: Stablecoin
}): Promise<TransferResult> {
  const from = config.TRON_WALLET_ADDRESS ?? 'MOCK_TRON_ADDR'

  if (!config.TRON_WALLET_PRIVATE_KEY || !config.TRON_WALLET_ADDRESS) {
    return {
      txHash: `mock_tron_${crypto.randomUUID().replace(/-/g, '')}`,
      chain: Chain.TRON,
      stablecoin: params.stablecoin ?? Stablecoin.USDT,
      from,
      to: params.to,
      amount: params.amount,
    }
  }

  const tronWeb = await getTronWeb()
  const amountSun = Math.round(parseFloat(params.amount) * 10 ** TRON_USDT_DECIMALS)

  const contract = await tronWeb.contract().at(config.TRON_USDT_CONTRACT)
  const txHash = await contract.transfer(params.to, amountSun).send({
    feeLimit: 40_000_000, // 40 TRX max fee
    callValue: 0,
  })

  return {
    txHash,
    chain: Chain.TRON,
    stablecoin: params.stablecoin ?? Stablecoin.USDT,
    from,
    to: params.to,
    amount: params.amount,
  }
}

export async function pollTronDeposit(params: {
  address: string
  stablecoin: Stablecoin
  minAmount: string
  onDeposit: (result: { txHash: string; amount: string }) => Promise<void>
  timeoutMs: number
}): Promise<void> {
  if (!config.TRON_WALLET_ADDRESS) {
    // Mock: immediately resolve with a fake deposit
    await params.onDeposit({
      txHash: `mock_tron_deposit_${crypto.randomUUID().replace(/-/g, '')}`,
      amount: params.minAmount,
    })
    return
  }

  const contract = config.TRON_USDT_CONTRACT
  const seen = new Set<string>()
  const deadline = Date.now() + params.timeoutMs
  const POLL_MS = 15_000

  await new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setInterval>

    async function poll() {
      if (Date.now() > deadline) {
        clearInterval(timer)
        reject(new Error(`TRON deposit watch timed out for ${params.address}`))
        return
      }

      try {
        const res = await axios.get<{
          data: { transaction_id: string; value: string; to: string }[]
        }>(
          `${config.TRON_API_URL}/v1/accounts/${params.address}/transactions/trc20`,
          {
            params: { contract_address: contract, limit: 20, only_to: true },
            headers: config.TRON_API_KEY ? { 'TRON-PRO-API-KEY': config.TRON_API_KEY } : {},
            timeout: 10000,
          }
        )

        for (const tx of res.data.data ?? []) {
          if (seen.has(tx.transaction_id)) continue
          seen.add(tx.transaction_id)

          const amount = (Number(tx.value) / 10 ** TRON_USDT_DECIMALS).toFixed(6)
          if (parseFloat(amount) >= parseFloat(params.minAmount)) {
            clearInterval(timer)
            await params.onDeposit({ txHash: tx.transaction_id, amount })
            resolve()
            return
          }
        }
      } catch { /* swallow transient errors — keep polling */ }
    }

    // First poll immediately, then on interval
    void poll()
    timer = setInterval(() => void poll(), POLL_MS)
  })
}

export async function getTronUsdtBalance(address: string): Promise<string> {
  if (!config.TRON_WALLET_PRIVATE_KEY) return '0'

  const tronWeb = await getTronWeb()
  const contract = await tronWeb.contract().at(config.TRON_USDT_CONTRACT)
  const raw = await contract.balanceOf(address).call()
  const balance = Number(raw) / 10 ** TRON_USDT_DECIMALS
  return balance.toFixed(TRON_USDT_DECIMALS)
}
