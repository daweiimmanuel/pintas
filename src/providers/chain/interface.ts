export interface TransferResult {
  txHash: string
  status: 'PENDING' | 'CONFIRMED' | 'FAILED'
}

export interface ChainProvider {
  transfer(orderId: string, toAddress: string, amountMicroUsdc: bigint): Promise<TransferResult>
  getConfirmations(txHash: string): Promise<number>
}
