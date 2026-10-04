import axios from 'axios'
import crypto from 'crypto'
import { config } from '../../config/index.js'
import type { BankDisbursementRequest, EwalletDisbursementRequest, DisbursementResult } from '../../types/index.js'

// DurianPay SNAP API disbursement (primary)
// Docs: https://docs.durianpay.id/docs/snap-disbursement-api-implementation

const EWALLET_CODES = ['GOPAY', 'OVO', 'DANA', 'SHOPEEPAY', 'LINKAJA'] as const
type EwalletCode = typeof EWALLET_CODES[number]

function durianpayHeaders(): Record<string, string> {
  const credentials = Buffer.from(`${config.DURIANPAY_API_KEY}:`).toString('base64')
  return {
    Authorization: `Basic ${credentials}`,
    'Content-Type': 'application/json',
  }
}

interface DurianpayTransferResponse {
  data: {
    id: string
    status: string
    bank_code?: string
    account_number?: string
    amount: string
    reference_no?: string
  }
}

interface DurianpayEwalletResponse {
  data: {
    id: string
    status: string
    emoney_id?: string
    amount: string
  }
}

export async function disburseToBankAccount(
  req: BankDisbursementRequest
): Promise<DisbursementResult> {
  if (!config.DURIANPAY_API_KEY) {
    return mockDisbursement(req.referenceId)
  }

  const res = await axios.post<DurianpayTransferResponse>(
    `${config.DURIANPAY_API_URL}/v1.0/transfer-interbank`,
    {
      partnerReferenceNo: req.referenceId,
      beneficiaryAccountNo: req.accountNumber,
      beneficiaryBankCode: req.bankCode,
      beneficiaryBankName: req.bankCode,
      beneficiaryAccountName: req.accountName,
      amount: { value: req.amountIdr, currency: 'IDR' },
      remark: req.note ?? 'Pintas disbursement',
    },
    { headers: durianpayHeaders(), timeout: 15000 }
  )

  const { data } = res.data
  return {
    disbursementId: data.id,
    referenceId: req.referenceId,
    status: mapDurianpayStatus(data.status),
    message: `Bank transfer to ${req.accountNumber}`,
  }
}

export async function disburseToEwallet(
  req: EwalletDisbursementRequest
): Promise<DisbursementResult> {
  if (!config.DURIANPAY_API_KEY) {
    return mockDisbursement(req.referenceId)
  }

  const channelCode = req.ewalletCode as EwalletCode

  const res = await axios.post<DurianpayEwalletResponse>(
    `${config.DURIANPAY_API_URL}/v1.0/emoney/topup`,
    {
      partnerReferenceNo: req.referenceId,
      channelCode,
      phoneNumber: req.phoneNumber,
      amount: { value: req.amountIdr, currency: 'IDR' },
      remark: req.note ?? 'Pintas disbursement',
    },
    { headers: durianpayHeaders(), timeout: 15000 }
  )

  const { data } = res.data
  return {
    disbursementId: data.id,
    referenceId: req.referenceId,
    status: mapDurianpayStatus(data.status),
    message: `E-wallet topup to ${req.phoneNumber} via ${channelCode}`,
  }
}

export async function verifyBankAccount(params: {
  bankCode: string
  accountNumber: string
}): Promise<{ valid: boolean; accountName?: string }> {
  if (!config.DURIANPAY_API_KEY) {
    return { valid: true, accountName: 'MOCK ACCOUNT' }
  }

  const res = await axios.post<{ data: { accountName: string } }>(
    `${config.DURIANPAY_API_URL}/v1.0/account-inquiry-external`,
    {
      bankCode: params.bankCode,
      accountNo: params.accountNumber,
    },
    { headers: durianpayHeaders(), timeout: 10000 }
  )

  return {
    valid: true,
    accountName: res.data.data.accountName,
  }
}

function mapDurianpayStatus(status: string): DisbursementResult['status'] {
  if (['completed', 'success'].includes(status.toLowerCase())) return 'completed'
  if (['failed', 'rejected'].includes(status.toLowerCase())) return 'failed'
  return 'processing'
}

function mockDisbursement(referenceId: string): DisbursementResult {
  return {
    disbursementId: `mock_${crypto.randomUUID()}`,
    referenceId,
    status: 'processing',
    message: 'Sandbox: disbursement queued',
  }
}

// Validate DurianPay webhook signature
export function validateDurianpayWebhook(body: string, signature: string): boolean {
  if (!config.DURIANPAY_API_KEY) return true
  const expected = crypto
    .createHmac('sha256', config.DURIANPAY_API_KEY)
    .update(body)
    .digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}
