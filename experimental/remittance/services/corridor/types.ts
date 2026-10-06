export interface CorridorQuote {
  corridorCode: string
  sourceCurrency: string
  amountSource: string
  feeSource: string
  netAmountSource: string
  fxRate: string
  spreadBps: number
  quotedAmountIdr: string
  expiresAt: Date
}

export interface RemittanceOrder {
  id: string
  status: string
  corridorCode: string
  sourceCurrency: string
  amountSource: string
  quotedAmountIdr: string
  expiresAt: Date
  createdAt: Date
}

export interface CreateRemittanceParams {
  customerId: string
  corridorCode: string
  sourceCurrency: string
  amountSource: string
  recipientName: string
  // Bank transfer
  recipientBank?: string
  recipientAccountNumber?: string
  // E-wallet
  recipientEwallet?: string
  recipientPhone?: string
}
