import crypto from 'crypto'
import { config } from '../../config/index.js'
import type { PayoutProvider, PayoutResult, AccountInquiryResult } from './interface.js'

const BASE = config.DURIANPAY_API_URL // https://api.durianpay.id

// ── B2B access token cache ────────────────────────────────────────────────────

let _token: { value: string; expiresAt: number } | null = null

function wibTimestamp(): string {
  // Durianpay SNAP requires ISO8601 with WIB (+07:00)
  const now = new Date()
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000
  const wib = new Date(utcMs + 7 * 3_600_000)
  return wib.toISOString().replace('Z', '+07:00')
}

async function getToken(): Promise<string> {
  if (_token && _token.expiresAt > Date.now() + 60_000) return _token.value

  const ts = wibTimestamp()
  const clientKey = config.DURIANPAY_CLIENT_KEY!
  const pem = config.DURIANPAY_PRIVATE_KEY!

  // Asymmetric signature: RSA-SHA256(privateKey, clientId + "|" + timestamp) → base64
  const signer = crypto.createSign('SHA256')
  signer.update(`${clientKey}|${ts}`)
  const sig = signer.sign(pem, 'base64')

  const res = await fetch(`${BASE}/v1.0/access-token/b2b`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CLIENT-KEY': clientKey,
      'X-TIMESTAMP': ts,
      'X-SIGNATURE': sig,
    },
    body: JSON.stringify({ grantType: 'client_credentials' }),
  })

  if (!res.ok) throw new Error(`Durianpay token ${res.status}: ${await res.text()}`)

  const data = await res.json() as { accessToken: string; expiresIn: number }
  _token = { value: data.accessToken, expiresAt: Date.now() + data.expiresIn * 1_000 }
  return _token.value
}

// ── Per-request SNAP headers ──────────────────────────────────────────────────

function buildHeaders(
  method: string,
  path: string,
  token: string,
  body: string,
): Record<string, string> {
  const ts = wibTimestamp()
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex').toLowerCase()
  const stringToSign = `${method}:${path}:${token}:${bodyHash}:${ts}`
  const sig = crypto.createHmac('sha512', config.DURIANPAY_API_KEY!).update(stringToSign).digest('base64')

  // X-EXTERNAL-ID must be unique within the same calendar day
  const externalId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`

  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-TIMESTAMP': ts,
    'X-SIGNATURE': sig,
    'X-PARTNER-ID': config.DURIANPAY_PARTNER_ID!,
    'X-EXTERNAL-ID': externalId,
    'CHANNEL-ID': config.DURIANPAY_CHANNEL_ID,
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

interface BankAccountRef {
  accountNo: string
  bankCode: string
  accountName: string
}

function parseRef(ref: string): BankAccountRef {
  try {
    return JSON.parse(ref) as BankAccountRef
  } catch {
    throw new Error('payoutAccountRef must be JSON: {accountNo, bankCode, accountName}')
  }
}

export const durianpayPayoutProvider: PayoutProvider = {
  async validateAccount(accountNo: string, bankCode: string): Promise<AccountInquiryResult> {
    const token = await getToken()
    const path = '/v1.0/account-inquiry-external'
    const body = JSON.stringify({
      beneficiaryAccountNo: accountNo,
      beneficiaryBankCode: bankCode,
      additionalInfo: { deviceId: 'server', channel: 'api' },
    })
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: buildHeaders('POST', path, token, body),
      body,
    })
    const data = await res.json() as {
      responseCode: string
      responseMessage: string
      beneficiaryAccountName?: string
      beneficiaryBankName?: string
    }

    const ok = data.responseCode.startsWith('200') || data.responseCode.startsWith('202')
    if (!ok) {
      throw new Error(`Account inquiry failed: ${data.responseMessage} (${data.responseCode})`)
    }

    return {
      accountName: data.beneficiaryAccountName ?? '',
      bankName: data.beneficiaryBankName ?? '',
    }
  },

  async payout(orderId: string, payoutAccountRef: string, amountCents: bigint): Promise<PayoutResult> {
    const acct = parseRef(payoutAccountRef)
    const token = await getToken()
    const path = '/v1.0/transfer-interbank'

    // amountCents is IDR in whole rupiah (IDR has no sub-units; caller passes rupiah directly)
    const amountStr = `${amountCents}.00`

    const body = JSON.stringify({
      partnerReferenceNo: orderId,
      amount: { value: amountStr, currency: 'IDR' },
      beneficiaryAccountName: acct.accountName,
      beneficiaryAccountNo: acct.accountNo,
      beneficiaryBankCode: acct.bankCode,
      sourceAccountNo: config.DURIANPAY_SOURCE_ACCOUNT_NO!,
      transactionDate: new Date().toISOString(),
      originatorInfos: [{
        originatorCustomerName: config.DURIANPAY_ORIGINATOR_NAME ?? 'PT Pintas Teknologi',
      }],
      additionalInfo: {
        deviceId: 'server',
        channel: 'api',
        originatorAdditionalInfos: {
          originatorIdentityType: config.DURIANPAY_ORIGINATOR_IDENTITY_TYPE ?? 'company_id',
          originatorIdentityNo: config.DURIANPAY_ORIGINATOR_IDENTITY_NO ?? '',
          originatorCountry: config.DURIANPAY_ORIGINATOR_COUNTRY,
        },
      },
    })

    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: buildHeaders('POST', path, token, body),
      body,
    })
    const data = await res.json() as {
      responseCode: string
      responseMessage: string
      referenceNo?: string
    }

    // 2001800 = accepted synchronously, 2021800 = queued (RTGS or async BI-FAST)
    if (data.responseCode === '2001800') {
      return { providerRef: data.referenceNo ?? orderId, status: 'SUCCESS' }
    }
    if (data.responseCode === '2021800') {
      return { providerRef: data.referenceNo ?? orderId, status: 'PENDING' }
    }

    return {
      providerRef: orderId,
      status: 'FAILED',
      failureReason: `${data.responseCode}: ${data.responseMessage}`,
    }
  },

  async getStatus(providerRef: string): Promise<PayoutResult> {
    // Durianpay sends final status via webhook; poll is not in the SNAP spec.
    // Return PENDING and rely on the disbursement webhook handler for resolution.
    return { providerRef, status: 'PENDING' }
  },
}
