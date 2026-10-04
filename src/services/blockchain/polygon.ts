import { ethers } from 'ethers'
import { config } from '../../config/index.js'
import type { TransferResult, WalletBalance } from '../../types/index.js'
import { Stablecoin, Chain } from '../../types/index.js'

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(config.POLYGON_RPC_URL)
}

function getWallet(): ethers.Wallet {
  if (!config.POLYGON_WALLET_PRIVATE_KEY) {
    throw new Error('Polygon wallet private key not configured')
  }
  return new ethers.Wallet(config.POLYGON_WALLET_PRIVATE_KEY, getProvider())
}

function getContractAddress(stablecoin: Stablecoin): string {
  if (stablecoin === Stablecoin.USDT) return config.POLYGON_USDT_CONTRACT
  if (stablecoin === Stablecoin.USDC) return config.POLYGON_USDC_CONTRACT
  throw new Error(`Unsupported stablecoin: ${stablecoin}`)
}

export async function getPolygonBalance(
  address: string,
  stablecoin: Stablecoin
): Promise<WalletBalance> {
  const provider = getProvider()
  const contractAddress = getContractAddress(stablecoin)
  const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider)

  const [rawBalance, decimals] = await Promise.all([
    contract.balanceOf(address) as Promise<bigint>,
    contract.decimals() as Promise<bigint>,
  ])

  const balance = ethers.formatUnits(rawBalance, decimals)

  return { chain: Chain.POLYGON, address, stablecoin, balance }
}

export async function sendPolygonStablecoin(params: {
  to: string
  amount: string
  stablecoin: Stablecoin
}): Promise<TransferResult> {
  const wallet = getWallet()
  const contractAddress = getContractAddress(params.stablecoin)
  const contract = new ethers.Contract(contractAddress, ERC20_ABI, wallet)

  const decimals = await (contract.decimals() as Promise<bigint>)
  const amountWei = ethers.parseUnits(params.amount, decimals)

  const tx = await (contract.transfer(params.to, amountWei) as Promise<ethers.TransactionResponse>)
  const receipt = await tx.wait(1)

  if (!receipt) throw new Error('Transaction receipt not received')

  return {
    txHash: receipt.hash,
    chain: Chain.POLYGON,
    from: wallet.address,
    to: params.to,
    amount: params.amount,
    stablecoin: params.stablecoin,
    blockNumber: receipt.blockNumber,
    confirmedAt: new Date(),
  }
}

export async function watchPolygonDeposit(params: {
  address: string
  stablecoin: Stablecoin
  minAmount: string
  onDeposit: (result: TransferResult) => Promise<void>
  timeoutMs?: number
}): Promise<void> {
  const provider = getProvider()
  const contractAddress = getContractAddress(params.stablecoin)
  const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider)
  const decimals = await (contract.decimals() as Promise<bigint>)
  const minAmountWei = ethers.parseUnits(params.minAmount, decimals)

  const timeout = params.timeoutMs ?? 3_600_000 // 1 hour default

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      contract.removeAllListeners()
      reject(new Error('Deposit watch timed out'))
    }, timeout)

    const filter = contract.filters.Transfer(null, params.address)
    contract.on(filter, async (from: string, to: string, amount: bigint, event: ethers.EventLog) => {
      if (amount < minAmountWei) return

      clearTimeout(timer)
      contract.removeAllListeners()

      await params.onDeposit({
        txHash: event.transactionHash,
        chain: Chain.POLYGON,
        from,
        to,
        amount: ethers.formatUnits(amount, decimals),
        stablecoin: params.stablecoin,
        blockNumber: event.blockNumber,
        confirmedAt: new Date(),
      })
      resolve()
    })
  })
}
