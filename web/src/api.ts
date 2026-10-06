let _apiKey = ''

export function initApi(apiKey: string) {
  _apiKey = apiKey
}

export interface SettlementOrder {
  id: string
  exporterId: string
  buyerId: string
  buyerName?: string
  quoteId: string
  invoiceRef: string
  invoiceAmountUsd: string
  fundedAmountUsd: string
  feeUsd: string
  netPayoutUsd: string
  status: string
  statusReason: string | null
  expiresAt: string
  version: number
  createdAt: string
  updatedAt: string
  collectionInstruction?: {
    paymentReference: string
    virtualAccountRef: string
    bankDetails: Record<string, string>
  }
}

export interface Quote {
  id: string
  exporterId: string
  invoiceAmountUsd: string
  feeUsd: string
  netPayoutUsd: string
  pricingVersion: string
  expiresAt: string
}

export interface OrderEvent {
  id: string
  orderId: string
  fromStatus: string
  toStatus: string
  trigger: string
  actor: string
  createdAt: string
}

export interface Buyer {
  id: string
  legalName: string
  country: string
  email: string
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (_apiKey) headers['Authorization'] = `Bearer ${_apiKey}`
  if (extraHeaders) Object.assign(headers, extraHeaders)

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const data = (await res.json()) as { success: boolean; data?: T; error?: { message?: string } }
  if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`)
  return data.data as T
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),

  post: <T>(url: string, body?: unknown) =>
    request<T>('POST', url, body, {
      'Idempotency-Key': crypto.randomUUID(),
    }),
}
