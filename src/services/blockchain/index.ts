import { Chain, Stablecoin } from '../../types/index.js'
import type { TransferResult, WalletBalance } from '../../types/index.js'
import { sendPolygonStablecoin, getPolygonBalance } from './polygon.js'
import { sendStellarStablecoin, getStellarBalance } from './stellar.js'
import { sendTronUsdt } from './tron.js'

export { watchPolygonDeposit } from './polygon.js'

export async function sendStablecoin(params: {
  chain: Chain
  to: string
  amount: string
  stablecoin: Stablecoin
  memo?: string
}): Promise<TransferResult> {
  switch (params.chain) {
    case Chain.POLYGON:
    case Chain.ETHEREUM:
      return sendPolygonStablecoin(params)
    case Chain.STELLAR:
      return sendStellarStablecoin(params)
    case Chain.TRON:
      return sendTronUsdt({ to: params.to, amount: params.amount, stablecoin: params.stablecoin })
    default:
      throw new Error(`Unsupported chain: ${params.chain}`)
  }
}

export async function getBalance(
  chain: Chain,
  address: string,
  stablecoin: Stablecoin
): Promise<WalletBalance> {
  switch (chain) {
    case Chain.POLYGON:
    case Chain.ETHEREUM:
      return getPolygonBalance(address, stablecoin)
    case Chain.STELLAR:
      return getStellarBalance(address, stablecoin)
    default:
      throw new Error(`Balance query not supported for chain: ${chain}`)
  }
}

export function getSettlementAddress(chain: Chain, stablecoin: Stablecoin): string {
  // Returns the Pintas settlement wallet address for receiving stablecoin deposits
  // These are configured per chain and managed by the custody provider
  const envKey = `${chain}_${stablecoin}_SETTLEMENT_ADDRESS`
  const address = process.env[envKey]
  if (!address) {
    throw new Error(`Settlement address not configured for ${chain}/${stablecoin}`)
  }
  return address
}
