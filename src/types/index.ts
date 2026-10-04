import { Chain, Stablecoin, OrderStatus, DisbursementType } from '@prisma/client'

export { Chain, Stablecoin, OrderStatus, DisbursementType }

// ─── Exchange ─────────────────────────────────────────────────────────────────

export interface RateQuote {
  pair: string          // "IDR_USDT"
  bid: string           // IDR per 1 stablecoin (sell stablecoin)
  ask: string           // IDR per 1 stablecoin (buy stablecoin)
  mid: string
  venue: string
  volume24h?: string
  fetchedAt: Date
}

export interface VwapRate {
  pair: string
  bid: string
  ask: string
  mid: string
  volume24h: string
  sources: string[]
  fetchedAt: Date
}

export interface OnrampQuote {
  orderId: string
  amountIdr: string
  stablecoin: Stablecoin
  chain: Chain
  rate: string           // IDR per 1 stablecoin
  quotedAmount: string   // stablecoin amount after spread
  spreadBps: number
  fee: string            // IDR fee amount
  expiresAt: Date
}

export interface OfframpQuote {
  orderId: string
  amountStablecoin: string
  stablecoin: Stablecoin
  chain: Chain
  rate: string           // IDR per 1 stablecoin
  quotedAmountIdr: string
  spreadBps: number
  fee: string
  expiresAt: Date
  depositAddress: string
}

// ─── BI-FAST / VA ─────────────────────────────────────────────────────────────

export interface VirtualAccountDetails {
  bank: string
  vaNumber: string
  amount: string
  currency: string
  expiresAt: Date
}

// ─── Disbursement ─────────────────────────────────────────────────────────────

export interface BankDisbursementRequest {
  bankCode: string
  accountNumber: string
  accountName: string
  amountIdr: string
  referenceId: string
  note?: string
}

export interface EwalletDisbursementRequest {
  ewalletCode: string
  phoneNumber: string
  amountIdr: string
  referenceId: string
  note?: string
}

export interface DisbursementResult {
  disbursementId: string
  referenceId: string
  status: 'processing' | 'completed' | 'failed'
  message?: string
}

// ─── Blockchain ───────────────────────────────────────────────────────────────

export interface TransferResult {
  txHash: string
  chain: Chain
  from: string
  to: string
  amount: string
  stablecoin: Stablecoin
  blockNumber?: number
  confirmedAt?: Date
}

export interface WalletBalance {
  chain: Chain
  address: string
  stablecoin: Stablecoin
  balance: string
}

// ─── KYC ──────────────────────────────────────────────────────────────────────

export interface KycTier1Request {
  nik: string
  fullName: string
  dateOfBirth: string   // ISO date
  selfieBase64?: string
}

export interface KycTier2Request {
  npwp: string
  companyName: string
  nibNumber: string
  directorNik: string
  directorName: string
}

export interface KycResult {
  providerRef: string
  status: 'approved' | 'rejected' | 'pending'
  score?: number
  notes?: string
}

// ─── Webhook Events ───────────────────────────────────────────────────────────

export type WebhookEvent =
  | 'onramp.created'
  | 'onramp.funded'
  | 'onramp.completed'
  | 'onramp.failed'
  | 'offramp.created'
  | 'offramp.funded'
  | 'offramp.completed'
  | 'offramp.failed'
  | 'kyc.approved'
  | 'kyc.rejected'
  | 'remittance.created'
  | 'remittance.funded'
  | 'remittance.completed'
  | 'remittance.failed'

export interface WebhookPayload {
  id: string
  event: WebhookEvent
  data: Record<string, unknown>
  timestamp: string
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: true
  data: T
}

export interface ApiError {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}
