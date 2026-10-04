import axios from 'axios'
import crypto from 'crypto'
import { config } from '../../config/index.js'
import type { VirtualAccountDetails } from '../../types/index.js'

// BCA BI-FAST Virtual Account integration
// Docs: https://developers.bca.co.id/

const SUPPORTED_BANKS = ['BCA', 'MANDIRI', 'BNI', 'BRI'] as const
type SupportedBank = typeof SUPPORTED_BANKS[number]

interface BcaVaRequest {
  PartnerServiceID: string
  CustomerNo: string
  VirtualAccountNo: string
  VirtualAccountName: string
  TotalAmount: { value: string; currency: string }
  ExpiredDate: string
  AdditionalInfo?: Record<string, string>
}

interface BcaVaResponse {
  responseCode: string
  responseMessage: string
  virtualAccountData: {
    partnerServiceID: string
    customerNo: string
    virtualAccountNo: string
    virtualAccountName: string
    totalAmount: { value: string; currency: string }
    expiredDate: string
  }
}

function generateBcaSignature(body: string, timestamp: string): string {
  const secret = config.BCA_API_SECRET ?? ''
  const payload = `${config.BCA_APP_ID}:${timestamp}:${body}`
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

export async function createVirtualAccount(params: {
  orderId: string
  amountIdr: string
  customerName: string
  bank?: SupportedBank
  expiryMinutes?: number
}): Promise<VirtualAccountDetails> {
  const bank = params.bank ?? 'BCA'
  const expiryMinutes = params.expiryMinutes ?? 60
  const expiresAt = new Date(Date.now() + expiryMinutes * 60_000)

  if (!config.BCA_APP_ID || !config.BCA_API_SECRET) {
    // Sandbox mode: generate a mock VA number for local development
    return generateMockVA({ ...params, bank, expiresAt })
  }

  const customerNo = params.orderId.replace(/[^0-9]/g, '').slice(0, 20).padStart(10, '0')
  const vaNumber = `${config.BCA_CORP_ID}${customerNo}`

  const body: BcaVaRequest = {
    PartnerServiceID: config.BCA_CORP_ID ?? '',
    CustomerNo: customerNo,
    VirtualAccountNo: vaNumber,
    VirtualAccountName: params.customerName.slice(0, 20),
    TotalAmount: { value: params.amountIdr, currency: 'IDR' },
    ExpiredDate: expiresAt.toISOString(),
  }

  const timestamp = new Date().toISOString()
  const bodyStr = JSON.stringify(body)
  const signature = generateBcaSignature(bodyStr, timestamp)

  const res = await axios.post<BcaVaResponse>(
    `${config.BCA_BIFFAST_URL}/banking/corporatebca/v1/bill-payment/bill-inquiry`,
    body,
    {
      headers: {
        Authorization: `Bearer ${config.BCA_APP_ID}`,
        'X-TIMESTAMP': timestamp,
        'X-SIGNATURE': signature,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  )

  if (res.data.responseCode !== '2002500') {
    throw new Error(`BCA VA creation failed: ${res.data.responseMessage}`)
  }

  return {
    bank,
    vaNumber: res.data.virtualAccountData.virtualAccountNo,
    amount: params.amountIdr,
    currency: 'IDR',
    expiresAt,
  }
}

function generateMockVA(params: {
  orderId: string
  amountIdr: string
  bank: SupportedBank
  expiresAt: Date
}): VirtualAccountDetails {
  const vaNumber = `70017${Math.floor(Math.random() * 9_000_000_000 + 1_000_000_000)}`
  return {
    bank: params.bank,
    vaNumber,
    amount: params.amountIdr,
    currency: 'IDR',
    expiresAt: params.expiresAt,
  }
}

export interface BifastCallbackPayload {
  virtualAccountNo: string
  paidAmount: string
  paidAt: string
  referenceNo: string
}

export function validateBifastCallback(body: string, signature: string): boolean {
  if (!config.BCA_API_SECRET) return true // sandbox: always valid
  const expected = crypto
    .createHmac('sha256', config.BCA_API_SECRET)
    .update(body)
    .digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}
