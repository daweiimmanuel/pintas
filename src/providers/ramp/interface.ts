export interface RampResult {
  providerRef: string
  status: 'SUCCESS' | 'PENDING' | 'FAILED'
  failureReason?: string
}

export interface RampProvider {
  mint(orderId: string, amountMicroUsdc: bigint): Promise<RampResult>
  redeem(orderId: string, amountMicroUsdc: bigint): Promise<RampResult>
  getStatus(providerRef: string): Promise<RampResult>
}
