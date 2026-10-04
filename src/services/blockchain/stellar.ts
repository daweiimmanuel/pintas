import {
  Horizon,
  Keypair,
  TransactionBuilder,
  Networks,
  Asset,
  Operation,
  BASE_FEE,
} from '@stellar/stellar-sdk'
import { config } from '../../config/index.js'
import type { TransferResult, WalletBalance } from '../../types/index.js'
import { Chain, Stablecoin } from '../../types/index.js'

// USDC on Stellar is issued by Circle
const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
const USDT_ISSUER = 'GCQTGZQQ5G4PTM2GL7CDIFKUBIPEC52BROAQIAPW53XBRJVN6ZJVTG6V'

function getServer(): Horizon.Server {
  return new Horizon.Server(config.STELLAR_HORIZON_URL)
}

function getNetwork(): string {
  return config.STELLAR_NETWORK === 'public' ? Networks.PUBLIC : Networks.TESTNET
}

function getStellarAsset(stablecoin: Stablecoin): Asset {
  if (stablecoin === Stablecoin.USDC) return new Asset('USDC', USDC_ISSUER)
  if (stablecoin === Stablecoin.USDT) return new Asset('USDT', USDT_ISSUER)
  throw new Error(`Unsupported Stellar stablecoin: ${stablecoin}`)
}

export async function getStellarBalance(
  address: string,
  stablecoin: Stablecoin
): Promise<WalletBalance> {
  const server = getServer()
  const account = await server.loadAccount(address)
  const asset = getStellarAsset(stablecoin)

  const balance = account.balances.find(
    (b) =>
      b.asset_type !== 'native' &&
      (b as Horizon.HorizonApi.BalanceLineAsset).asset_code === asset.getCode() &&
      (b as Horizon.HorizonApi.BalanceLineAsset).asset_issuer === asset.getIssuer()
  )

  return {
    chain: Chain.STELLAR,
    address,
    stablecoin,
    balance: balance?.balance ?? '0',
  }
}

export async function sendStellarStablecoin(params: {
  to: string
  amount: string
  stablecoin: Stablecoin
  memo?: string
}): Promise<TransferResult> {
  if (!config.STELLAR_WALLET_SECRET) {
    throw new Error('Stellar wallet secret not configured')
  }

  const server = getServer()
  const keypair = Keypair.fromSecret(config.STELLAR_WALLET_SECRET)
  const account = await server.loadAccount(keypair.publicKey())
  const asset = getStellarAsset(params.stablecoin)

  const txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: getNetwork(),
  })
    .addOperation(
      Operation.payment({
        destination: params.to,
        asset,
        amount: params.amount,
      })
    )
    .setTimeout(30)

  if (params.memo) {
    txBuilder.addMemo({ value: params.memo } as Parameters<typeof txBuilder.addMemo>[0])
  }

  const tx = txBuilder.build()
  tx.sign(keypair)

  const result = await server.submitTransaction(tx)

  return {
    txHash: result.hash,
    chain: Chain.STELLAR,
    from: keypair.publicKey(),
    to: params.to,
    amount: params.amount,
    stablecoin: params.stablecoin,
    confirmedAt: new Date(),
  }
}
