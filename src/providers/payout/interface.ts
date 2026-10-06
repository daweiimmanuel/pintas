export interface PayoutResult {
  providerRef: string
  status: 'SUCCESS' | 'PENDING' | 'FAILED'
  failureReason?: string
}

export interface PayoutProvider {
  payout(orderId: string, payoutAccountRef: string, amountCents: bigint): Promise<PayoutResult>
  getStatus(providerRef: string): Promise<PayoutResult>
}
