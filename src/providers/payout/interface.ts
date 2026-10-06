export interface PayoutResult {
  providerRef: string
  status: 'SUCCESS' | 'PENDING' | 'FAILED'
  failureReason?: string
}

export interface AccountInquiryResult {
  accountName: string
  bankName: string
}

export interface PayoutProvider {
  /** Validate a bank account number before disbursing (optional; mock always succeeds). */
  validateAccount?(accountNo: string, bankCode: string): Promise<AccountInquiryResult>
  /** Disburse funds. payoutAccountRef is a JSON string: {accountNo,bankCode,accountName}.
   *  amountCents = IDR amount in rupiah for IDR payout providers (IDR has no sub-units). */
  payout(orderId: string, payoutAccountRef: string, amountCents: bigint): Promise<PayoutResult>
  getStatus(providerRef: string): Promise<PayoutResult>
}
