import { Chain, Stablecoin } from '../../types/index.js'
import type { TransferResult, WalletBalance } from '../../types/index.js'
import { config } from '../../config/index.js'
import { sendPolygonStablecoin, getPolygonBalance } from './polygon.js'
import { sendStellarStablecoin, getStellarBalance } from './stellar.js'
import { sendTronUsdt } from './tron.js'
import { screenAddress, isHighRisk } from '../aml/chainalysis.js'

export { watchPolygonDeposit } from './polygon.js'

export async function sendStablecoin(params: {
  chain: Chain
  to: string
  amount: string
  stablecoin: Stablecoin
  memo?: string
}): Promise<TransferResult> {
  const screening = await screenAddress(params.to)
  if (isHighRisk(screening)) {
    throw Object.assign(
      new Error(`Address failed AML screening (risk: ${screening.risk})`),
      { statusCode: 403 }
    )
  }

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
  const envKey = `${chain}_${stablecoin}_SETTLEMENT_ADDRESS` as keyof typeof config
  const address = (config as unknown as Record<string, string | undefined>)[envKey as string]
  if (!address) {
    throw new Error(`Settlement address not configured for ${chain}/${stablecoin}`)
  }
  return address
}
