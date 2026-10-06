import axios from 'axios'
import crypto from 'crypto'
import { config } from '../../config/index.js'
import type { BankDisbursementRequest, EwalletDisbursementRequest, DisbursementResult } from '../../types/index.js'

// DurianPay SNAP BI disbursement
// Spec: https://docs.durianpay.id/docs/snap-disbursement-api-implementation
// SNAP BI header standard: X-TIMESTAMP, X-CLIENT-KEY, X-SIGNATURE, X-PARTNER-ID,
//                          X-REQUEST-ID, X-EXTERNAL-ID, CHANNEL-ID, Authorization: Bearer

const EWALLET_CODES = ['GOPAY', 'OVO', 'DANA', 'SHOPEEPAY', 'LINKAJA'] as const
type EwalletCode = typeof EWALLET_CODES[number]

// ── SNAP token cache ─────────────────────────────────────────────────────────

interface TokenCache {
  token: string
  expiresAt: number // epoch ms
}
let tokenCache: TokenCache | null = null

function snapTimestamp(): string {
  // SNAP requires ISO 8601 with Jakarta timezone offset (+07:00)
  const now = new Date()
  const jakartaOffset = 7 * 60
  const local = new Date(now.getTime() + jakartaOffset * 60 * 1000)
  const iso = local.toISOString().replace('Z', '+07:00')
  return iso
}

// Access token signature: HMAC-SHA256 of "<clientKey>|<timestamp>" using API key as secret
function accessTokenSignature(clientKey: string, timestamp: string): string {
  return crypto
    .createHmac('sha256', config.DURIANPAY_API_KEY!)
    .update(`${clientKey}|${timestamp}`)
    .digest('base64')
}

// Service request signature: HMAC-SHA512 of "<METHOD>:<path>:<accessToken>:<sha256hex(body)>:<timestamp>"
function serviceSignature(
  method: string,
  path: string,
  accessToken: string,
  body: object,
  timestamp: string
): string {
  const minified = JSON.stringify(body)
  const bodyHash = crypto.createHash('sha256').update(minified).digest('hex').toLowerCase()
  const payload = `${method}:${path}:${accessToken}:${bodyHash}:${timestamp}`
  return crypto
    .createHmac('sha512', config.DURIANPAY_API_KEY!)
    .update(payload)
    .digest('base64')
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.token
  }

  const clientKey = config.DURIANPAY_CLIENT_KEY!
  const timestamp = snapTimestamp()
  const signature = accessTokenSignature(clientKey, timestamp)

  const res = await axios.post<{ accessToken: string; expiresIn: number }>(
    `${config.DURIANPAY_API_URL}/v1.0/access-token/b2b`,
    { grantType: 'client_credentials' },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-TIMESTAMP': timestamp,
        'X-CLIENT-KEY': clientKey,
        'X-SIGNATURE': signature,
      },
      timeout: 10000,
    }
  )

  tokenCache = {
    token: res.data.accessToken,
    expiresAt: Date.now() + res.data.expiresIn * 1000,
  }
  return tokenCache.token
}

function snapHeaders(
  method: string,
  path: string,
  body: object,
  externalId: string,
  accessToken: string
): Record<string, string> {
  const timestamp = snapTimestamp()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'X-TIMESTAMP': timestamp,
    'X-CLIENT-KEY': config.DURIANPAY_CLIENT_KEY!,
    'X-PARTNER-ID': config.DURIANPAY_PARTNER_ID ?? '',
    'X-REQUEST-ID': crypto.randomUUID(),
    'X-EXTERNAL-ID': externalId,
    'CHANNEL-ID': config.DURIANPAY_CHANNEL_ID,
    'X-SIGNATURE': serviceSignature(method, path, accessToken, body, timestamp),
  }
}

// ── Response types ────────────────────────────────────────────────────────────

interface SnapTransferResponse {
  responseCode: string
  responseMessage: string
  virtualAccountData?: {
    partnerServiceId?: string
    customerNo?: string
    virtualAccountNo?: string
    virtualAccountName?: string
    trxId?: string
  }
  data?: {
    id: string
    status: string
    reference_no?: string
    bank_code?: string
    account_number?: string
    amount: string
  }
}

interface SnapEwalletResponse {
  responseCode: string
  responseMessage: string
  data?: {
    id: string
    status: string
    emoney_id?: string
    amount: string
  }
}

interface SnapInquiryResponse {
  responseCode: string
  responseMessage: string
  beneficiaryAccountName?: string
  data?: { accountName: string }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function disburseToBankAccount(
  req: BankDisbursementRequest
): Promise<DisbursementResult> {
  if (!config.DURIANPAY_API_KEY || !config.DURIANPAY_CLIENT_KEY) {
    return mockDisbursement(req.referenceId)
  }

  const path = '/v1.0/transfer-interbank'
  const body = {
    partnerReferenceNo: req.referenceId,
    beneficiaryAccountNo: req.accountNumber,
    beneficiaryBankCode: req.bankCode,
    beneficiaryBankName: req.bankCode,
    beneficiaryAccountName: req.accountName,
    amount: { value: req.amountIdr, currency: 'IDR' },
    remark: req.note ?? 'Pintas disbursement',
  }

  const accessToken = await getAccessToken()
  const res = await axios.post<SnapTransferResponse>(
    `${config.DURIANPAY_API_URL}${path}`,
    body,
    { headers: snapHeaders('POST', path, body, req.referenceId, accessToken), timeout: 15000 }
  )

  const d = res.data.data
  return {
    disbursementId: d?.id ?? req.referenceId,
    referenceId: req.referenceId,
    status: mapSnapResponseCode(res.data.responseCode),
    message: `Bank transfer to ${req.accountNumber} (${res.data.responseMessage})`,
  }
}

export async function disburseToEwallet(
  req: EwalletDisbursementRequest
): Promise<DisbursementResult> {
  if (!config.DURIANPAY_API_KEY || !config.DURIANPAY_CLIENT_KEY) {
    return mockDisbursement(req.referenceId)
  }

  const channelCode = req.ewalletCode as EwalletCode
  const path = '/v1.0/emoney/topup'
  const body = {
    partnerReferenceNo: req.referenceId,
    channelCode,
    phoneNumber: req.phoneNumber,
    amount: { value: req.amountIdr, currency: 'IDR' },
    remark: req.note ?? 'Pintas disbursement',
  }

  const accessToken = await getAccessToken()
  const res = await axios.post<SnapEwalletResponse>(
    `${config.DURIANPAY_API_URL}${path}`,
    body,
    { headers: snapHeaders('POST', path, body, req.referenceId, accessToken), timeout: 15000 }
  )

  const d = res.data.data
  return {
    disbursementId: d?.id ?? req.referenceId,
    referenceId: req.referenceId,
    status: mapSnapResponseCode(res.data.responseCode),
    message: `E-wallet topup to ${req.phoneNumber} via ${channelCode} (${res.data.responseMessage})`,
  }
}

export async function verifyBankAccount(params: {
  bankCode: string
  accountNumber: string
}): Promise<{ valid: boolean; accountName?: string }> {
  if (!config.DURIANPAY_API_KEY || !config.DURIANPAY_CLIENT_KEY) {
    return { valid: true, accountName: 'MOCK ACCOUNT' }
  }

  const path = '/v1.0/account-inquiry-external'
  const body = {
    beneficiaryBankCode: params.bankCode,
    beneficiaryAccountNo: params.accountNumber,
    partnerReferenceNo: crypto.randomUUID(),
  }

  const accessToken = await getAccessToken()
  const res = await axios.post<SnapInquiryResponse>(
    `${config.DURIANPAY_API_URL}${path}`,
    body,
    { headers: snapHeaders('POST', path, body, body.partnerReferenceNo, accessToken), timeout: 10000 }
  )

  const accountName = res.data.beneficiaryAccountName ?? res.data.data?.accountName
  return { valid: !!accountName, accountName }
}

// ── Status mapping ────────────────────────────────────────────────────────────

// SNAP response codes: 2xx = success, 4xx = error, see BI SNAP spec §4
function mapSnapResponseCode(code: string): DisbursementResult['status'] {
  if (code.startsWith('2')) return 'completed'
  if (code.startsWith('4') || code.startsWith('5')) return 'failed'
  return 'processing' // 3xx = in-progress
}

// ── Disbursement status check (used by poller worker) ─────────────────────────

interface SnapTransferStatusResponse {
  responseCode: string
  responseMessage: string
  data?: { id: string; latestTransactionStatus: string }
}

export async function checkDisbursementStatus(
  referenceId: string
): Promise<'completed' | 'failed' | 'processing'> {
  if (!config.DURIANPAY_API_KEY || !config.DURIANPAY_CLIENT_KEY) {
    return 'completed' // sandbox: always resolve
  }

  const path = `/v1.0/transfer-interbank/${referenceId}`
  const accessToken = await getAccessToken()
  const res = await axios.get<SnapTransferStatusResponse>(
    `${config.DURIANPAY_API_URL}${path}`,
    {
      headers: snapHeaders('GET', path, {}, referenceId, accessToken),
      timeout: 10000,
    }
  )

  const txStatus = res.data.data?.latestTransactionStatus
  if (txStatus === '00') return 'completed'
  if (txStatus && !['03', '01'].includes(txStatus)) return 'failed'
  return 'processing'
}

// ── Webhook signature validation ──────────────────────────────────────────────

// DurianPay SNAP webhooks are signed with HMAC-SHA512 using the API key
export function validateDurianpayWebhook(body: string, signature: string): boolean {
  if (!config.DURIANPAY_API_KEY) return true
  const expected = crypto
    .createHmac('sha512', config.DURIANPAY_API_KEY)
    .update(body)
    .digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

// ── Mock ──────────────────────────────────────────────────────────────────────

function mockDisbursement(referenceId: string): DisbursementResult {
  return {
    disbursementId: `mock_${crypto.randomUUID()}`,
    referenceId,
    status: 'processing',
    message: 'Sandbox: disbursement queued',
  }
}
