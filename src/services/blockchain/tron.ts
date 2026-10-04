import crypto from 'crypto'
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

export async function getTronUsdtBalance(address: string): Promise<string> {
  if (!config.TRON_WALLET_PRIVATE_KEY) return '0'

  const tronWeb = await getTronWeb()
  const contract = await tronWeb.contract().at(config.TRON_USDT_CONTRACT)
  const raw = await contract.balanceOf(address).call()
  const balance = Number(raw) / 10 ** TRON_USDT_DECIMALS
  return balance.toFixed(TRON_USDT_DECIMALS)
}
