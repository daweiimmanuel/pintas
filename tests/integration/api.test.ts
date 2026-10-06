/**
 * Integration tests for Pintas API
 */
import crypto from 'crypto'
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest'
import { buildServer } from '../../src/api/server.js'
import type { FastifyInstance } from 'fastify'

// ─── Exchange mocks ───────────────────────────────────────────────────────────

vi.mock('../../src/services/exchange/indodax.js', () => ({
  fetchIndodaxRate: vi.fn().mockResolvedValue({
    pair: 'IDR_USDT',
    bid: '15800000',
    ask: '15900000',
    mid: '15850000',
    venue: 'indodax',
    volume24h: '5000000',
    fetchedAt: new Date(),
  }),
}))

vi.mock('../../src/services/exchange/tokocrypto.js', () => ({
  fetchTokocryptoRate: vi.fn().mockResolvedValue({
    pair: 'IDR_USDT',
    bid: '15820000',
    ask: '15920000',
    mid: '15870000',
    venue: 'tokocrypto',
    volume24h: '3000000',
    fetchedAt: new Date(),
  }),
}))

// ─── Prisma mock (all vi.fn() — no variable refs, safe to hoist) ─────────────

vi.mock('../../src/db/client.js', () => ({
  prisma: {
    apiKey: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({ id: 'key_new_001', name: 'New Key', scopes: ['*'], ipAllowlist: [], expiresAt: null, lastUsedAt: null, createdAt: new Date(), updatedAt: new Date(), revokedAt: null }),
      findMany: vi.fn().mockResolvedValue([{ id: 'key_test_001', name: 'Test Key', scopes: ['*'], ipAllowlist: [], lastUsedAt: null, expiresAt: null, createdAt: new Date() }]),
      findFirst: vi.fn().mockResolvedValue({ id: 'key_other_001', name: 'Other Key' }),
    },
    exchangeRate: { create: vi.fn().mockResolvedValue({}) },
    virtualAccount: { findUnique: vi.fn().mockResolvedValue(null) },
    onrampOrder: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'onramp_001', status: 'PENDING', createdAt: new Date(), updatedAt: new Date() }),
    },
    offrampOrder: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'offramp_001', status: 'PENDING', createdAt: new Date(), updatedAt: new Date() }),
    },
    otcOrder: {
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'otc_001', status: 'QUOTED', createdAt: new Date(), updatedAt: new Date() }),
      update: vi.fn().mockResolvedValue({ id: 'otc_001', status: 'ACCEPTED', createdAt: new Date(), updatedAt: new Date() }),
    },
    wallet: {
      create: vi.fn().mockResolvedValue({ id: 'wallet_001', chain: 'POLYGON', stablecoin: 'USDT', address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', createdAt: new Date() }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue({}),
    },
    kycRecord: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'kyc_001', tier: 'TIER1', status: 'APPROVED', createdAt: new Date(), updatedAt: new Date() }),
      update: vi.fn().mockResolvedValue({ id: 'kyc_001', tier: 'TIER1', status: 'APPROVED', reviewedAt: new Date(), createdAt: new Date(), updatedAt: new Date() }),
    },
    customer: {
      update: vi.fn().mockResolvedValue({}),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'cust_test_sprint4', name: 'Test Corp', email: 'test@testcorp.io' }),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'cust_new_001', name: 'New Corp', email: 'new@corp.io', kybStatus: 'PENDING', tier: 'TIER1', createdAt: new Date(), updatedAt: new Date() }),
    },
    remittanceOrder: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'remit_001', status: 'PENDING', createdAt: new Date(), updatedAt: new Date() }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: 'remit_001', status: 'PROCESSING', createdAt: new Date(), updatedAt: new Date() }),
    },
    exporter: {
      create: vi.fn().mockResolvedValue({ id: 'exp_001', legalName: 'PT Ekspor Jaya', nib: '1234567890123', npwp: '123456789012345', country: 'ID', segment: 'FORK_B', kybStatus: 'PENDING', kybTier: 0, createdAt: new Date(), updatedAt: new Date() }),
      findUnique: vi.fn().mockResolvedValue({ id: 'exp_001', legalName: 'PT Ekspor Jaya', kybStatus: 'PENDING', kybTier: 0 }),
      update: vi.fn().mockResolvedValue({ id: 'exp_001', kybStatus: 'APPROVED', kybTier: 1 }),
    },
    payoutAccount: {
      create: vi.fn().mockResolvedValue({ id: 'pa_001', exporterId: 'exp_001', type: 'OFFSHORE_USD', bankName: 'Bank of America', accountNumberMasked: '****6789', currency: 'USD', status: 'ACTIVE', createdAt: new Date() }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    buyer: {
      create: vi.fn().mockResolvedValue({ id: 'buy_001', exporterId: 'exp_001', legalName: 'Acme Corp', country: 'US', email: 'ap@acme.com', createdAt: new Date(), updatedAt: new Date() }),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    quote: {
      create: vi.fn().mockResolvedValue({
        id: 'q_001', exporterId: 'exp_001',
        invoiceAmountCents: 1_000_000n, feeCents: 5_000n, netPayoutCents: 995_000n,
        pricingVersion: 'v1-example', expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date(), updatedAt: new Date(),
      }),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    webhook: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: 'wh_001', customerId: 'cust_test_sprint4' }),
    },
    webhookDelivery: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'del_001', webhookId: 'wh_001', event: 'onramp.created', attempts: 1, succeededAt: new Date(), failedAt: null, createdAt: new Date() },
      ]),
    },
  },
}))

// ─── Redis mock ───────────────────────────────────────────────────────────────

vi.mock('../../src/lib/redis.js', () => ({
  getRedis: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    ping: vi.fn().mockResolvedValue('PONG'),
    on: vi.fn(),
  })),
  redisPing: vi.fn().mockResolvedValue(true),
}))

// ─── BI-FAST mock ─────────────────────────────────────────────────────────────

vi.mock('../../src/services/biffast/index.js', () => ({
  createVirtualAccount: vi.fn().mockResolvedValue({
    bank: 'BCA',
    vaNumber: '70017999000001',
    amount: '1000000',
    currency: 'IDR',
    expiresAt: new Date(Date.now() + 86400000),
  }),
  validateBifastCallback: vi.fn().mockReturnValue(true),
  handleBifastPayment: vi.fn().mockResolvedValue(undefined),
}))

// ─── Verihubs KYC mock ────────────────────────────────────────────────────────

vi.mock('../../src/services/kyc/verihubs.js', () => ({
  verifyTier1: vi.fn().mockResolvedValue({
    providerRef: 'mock_kyc_ref',
    status: 'approved',
    score: 95,
  }),
  verifyTier2: vi.fn().mockResolvedValue({
    providerRef: 'mock_kyc_ref_t2',
    status: 'approved',
    score: 90,
  }),
  verifyTier3: vi.fn().mockReturnValue({
    providerRef: 'tier3_manual_123456789012345',
    status: 'pending',
    notes: 'Manual review required. UBOs: John Doe',
  }),
}))

vi.mock('../../src/services/disbursement/index.js', () => ({
  disburseToBankAccount: vi.fn().mockResolvedValue({ disbursementId: 'disb_001' }),
  disburseToEwallet: vi.fn().mockResolvedValue({ disbursementId: 'disb_ew_001' }),
  verifyBankAccount: vi.fn().mockResolvedValue({ valid: true, accountName: 'PT Test Indonesia' }),
  validateDurianpayWebhook: vi.fn().mockReturnValue(true),
}))

vi.mock('../../src/services/travel-rule/index.js', () => ({
  travelRuleRequired: vi.fn().mockReturnValue(false),
  submitTravelRule: vi.fn().mockResolvedValue(undefined),
}))

// ─── AML mock (default: low risk, pass) ───────────────────────────────────────

vi.mock('../../src/services/aml/chainalysis.js', () => ({
  screenAddress: vi.fn().mockResolvedValue({ address: '0xtest', risk: 'low' }),
  isHighRisk: vi.fn().mockReturnValue(false),
}))

// ─── Test constants (safe outside mock factories) ─────────────────────────────

const TEST_RAW_KEY = 'pintas-test-api-key-sprint4-32chars!!'
const TEST_CUSTOMER_ID = 'cust_test_sprint4'
const TEST_KEY_HASH = crypto.createHash('sha256').update(TEST_RAW_KEY).digest('hex')

const mockApiKey = {
  id: 'key_test_001',
  keyHash: TEST_KEY_HASH,
  customerId: TEST_CUSTOMER_ID,
  name: 'Test Key',
  scopes: ['*'],
  ipAllowlist: [] as string[],
  revokedAt: null,
  expiresAt: null,
  lastUsedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  customer: {
    id: TEST_CUSTOMER_ID,
    name: 'Test Corp',
    email: 'test@testcorp.io',
    kybStatus: 'PENDING',
    tier: 'TIER1',
  },
}

function authHeaders() {
  return { Authorization: `Bearer ${TEST_RAW_KEY}` }
}

let server: FastifyInstance

beforeAll(async () => {
  server = await buildServer()
  await server.ready()
})

afterAll(async () => {
  await server.close()
})

// ─── Unauthenticated tests ────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('ok')
    expect(body.timestamp).toBeTruthy()
  })
})

describe('Authenticated endpoints require bearer token', () => {
  const endpoints = [
    ['GET', '/v1/rates'],
    ['GET', '/v1/rates/quote/onramp?amountIdr=1000000'],
    ['GET', '/v1/rates/quote/offramp?amountStablecoin=10'],
    ['GET', '/v1/transactions'],
    ['GET', '/v1/kyc'],
    ['GET', '/v1/webhooks'],
    ['GET', '/v1/wallets'],
  ] as const

  for (const [method, url] of endpoints) {
    it(`${method} ${url} → 401 without auth`, async () => {
      const res = await server.inject({ method, url })
      expect(res.statusCode).toBe(401)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('UNAUTHORIZED')
    })
  }
})

describe('POST endpoints require bearer token', () => {
  it('POST /v1/onramp → 401 without auth', async () => {
    const res = await server.inject({ method: 'POST', url: '/v1/onramp', payload: {} })
    expect(res.statusCode).toBe(401)
  })

  it('POST /v1/offramp → 401 without auth', async () => {
    const res = await server.inject({ method: 'POST', url: '/v1/offramp', payload: {} })
    expect(res.statusCode).toBe(401)
  })
})

describe('Callback endpoints skip authentication', () => {
  it('POST /v1/callbacks/biffast → rejects invalid signature gracefully', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/callbacks/biffast',
      payload: {
        virtualAccountNo: '700171234567890',
        paidAmount: '1000000',
        referenceNo: 'REF-001',
      },
      headers: { 'x-bca-signature': 'invalid' },
    })
    expect([200, 401]).toContain(res.statusCode)
  })
})

// ─── Validation errors return 400 ─────────────────────────────────────────────

describe('Validation errors return 400', () => {
  beforeEach(async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(mockApiKey as never)
  })

  it('POST /v1/onramp with missing fields → 400 VALIDATION_ERROR', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/onramp',
      payload: { stablecoin: 'USDT' },
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('POST /v1/otc/quote with amountIdr below 75M → 400', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/otc/quote',
      payload: {
        side: 'BUY',
        stablecoin: 'USDT',
        chain: 'TRON',
        amountIdr: '50000000',
      },
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(400)
  })
})

// ─── Authenticated: rates ─────────────────────────────────────────────────────

describe('Authenticated: rates', () => {
  beforeEach(async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(mockApiKey as never)
  })

  it('GET /v1/rates → 200 with bid/ask', async () => {
    const res = await server.inject({ method: 'GET', url: '/v1/rates', headers: authHeaders() })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data.rates)).toBe(true)
    expect(body.data.rates.length).toBeGreaterThan(0)
    expect(Number(body.data.rates[0].bid)).toBeGreaterThan(0)
  })

  it('GET /v1/rates/quote/onramp?amountIdr=10000000 → 200 with quotedAmount', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/v1/rates/quote/onramp?amountIdr=10000000',
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(Number(body.data.quotedAmount)).toBeGreaterThan(0)
    expect(new Date(body.data.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })
})

// ─── Authenticated: transactions ──────────────────────────────────────────────

describe('Authenticated: transactions', () => {
  beforeEach(async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(mockApiKey as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(prisma as any).onrampOrder.findMany = vi.fn().mockResolvedValue([])
    ;(prisma as any).offrampOrder.findMany = vi.fn().mockResolvedValue([])
    ;(prisma as any).remittanceOrder.findMany = vi.fn().mockResolvedValue([])
  })

  it('GET /v1/transactions → 200 with items array', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/v1/transactions',
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data.items)).toBe(true)
  })
})

// ─── Authenticated: onramp ────────────────────────────────────────────────────

describe('Authenticated: onramp', () => {
  beforeEach(async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(mockApiKey as never)
    vi.mocked(prisma.onrampOrder.create).mockResolvedValue({
      id: 'onramp_001',
      customerId: TEST_CUSTOMER_ID,
      status: 'PENDING',
      amountIdr: '5000000' as never,
      stablecoin: 'USDT' as never,
      chain: 'POLYGON' as never,
      destinationAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)
  })

  it('POST /v1/onramp with valid body → 201 with VA', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/onramp',
      payload: {
        amountIdr: '5000000',
        stablecoin: 'USDT',
        chain: 'POLYGON',
        destinationAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      },
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.data.virtualAccount).toBeDefined()
    expect(body.data.virtualAccount.vaNumber).toBeTruthy()
  })
})

// ─── Authenticated: wallets ───────────────────────────────────────────────────

describe('Authenticated: wallets', () => {
  beforeEach(async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(mockApiKey as never)
    vi.mocked(prisma.wallet.create).mockResolvedValue({
      id: 'wallet_001',
      customerId: TEST_CUSTOMER_ID,
      chain: 'POLYGON' as never,
      stablecoin: 'USDT' as never,
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      label: 'Primary wallet',
      createdAt: new Date(),
    } as never)
    vi.mocked(prisma.wallet.findMany).mockResolvedValue([
      {
        id: 'wallet_001',
        customerId: TEST_CUSTOMER_ID,
        chain: 'POLYGON' as never,
        stablecoin: 'USDT' as never,
        address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        label: 'Primary wallet',
        createdAt: new Date(),
      },
    ] as never)
  })

  it('POST /v1/wallets with valid Polygon address → 201', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/wallets',
      payload: {
        chain: 'POLYGON',
        stablecoin: 'USDT',
        address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        label: 'Primary wallet',
      },
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.data.chain).toBe('POLYGON')
  })

  it('POST /v1/wallets with invalid address format → 400', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/wallets',
      payload: {
        chain: 'POLYGON',
        stablecoin: 'USDT',
        address: 'not-a-valid-address',
      },
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('INVALID_ADDRESS')
  })

  it('GET /v1/wallets → 200 with wallet list', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/v1/wallets',
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.data[0].chain).toBe('POLYGON')
  })
})

// ─── Authenticated: OTC ───────────────────────────────────────────────────────

describe('Authenticated: OTC', () => {
  beforeEach(async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(mockApiKey as never)
    vi.mocked(prisma.otcOrder.create).mockResolvedValue({
      id: 'otc_001',
      customerId: TEST_CUSTOMER_ID,
      side: 'BUY' as never,
      stablecoin: 'USDT' as never,
      chain: 'TRON' as never,
      amountIdr: '75000000' as never,
      amountStablecoin: '4717.00' as never,
      rate: '15900000' as never,
      spreadBps: 30,
      status: 'QUOTED' as never,
      expiresAt: new Date(Date.now() + 30_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)
  })

  it('POST /v1/otc/quote with IDR ≥ 75M → 201 with expiresAt', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/otc/quote',
      payload: {
        side: 'BUY',
        stablecoin: 'USDT',
        chain: 'TRON',
        amountIdr: '75000000',
        destinationAddress: 'TN3W4H6rK2ce4vX9YnFQHwKx7W6Gm3Vk3T',
      },
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.data.orderId).toBeTruthy()
    expect(Number(body.data.amountStablecoin)).toBeGreaterThan(0)
    expect(new Date(body.data.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })
})

// ─── Authenticated: customer profile (/v1/me) ────────────────────────────────

describe('Authenticated: /v1/me', () => {
  beforeEach(async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(mockApiKey as never)
    vi.mocked(prisma.customer.findUniqueOrThrow).mockResolvedValue({
      id: TEST_CUSTOMER_ID,
      name: 'Test Corp',
      email: 'test@testcorp.io',
      kybStatus: 'PENDING' as never,
      tier: 'TIER1' as never,
      createdAt: new Date(),
    } as never)
  })

  it('GET /v1/me → 200 with customer data', async () => {
    const res = await server.inject({ method: 'GET', url: '/v1/me', headers: authHeaders() })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe(TEST_CUSTOMER_ID)
    expect(body.data.email).toBe('test@testcorp.io')
    expect(body.data.kybStatus).toBeTruthy()
  })

  it('PATCH /v1/me → 200 updates name', async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.customer.update).mockResolvedValue({
      id: TEST_CUSTOMER_ID,
      name: 'Updated Corp',
      email: 'test@testcorp.io',
      kybStatus: 'PENDING' as never,
      tier: 'TIER1' as never,
      updatedAt: new Date(),
    } as never)

    const res = await server.inject({
      method: 'PATCH',
      url: '/v1/me',
      payload: { name: 'Updated Corp' },
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.name).toBe('Updated Corp')
  })
})

// ─── Authenticated: API key management ───────────────────────────────────────

describe('Authenticated: /v1/api-keys', () => {
  beforeEach(async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(mockApiKey as never)
    vi.mocked(prisma.apiKey.create).mockResolvedValue({
      id: 'key_new_001',
      name: 'Integration Key',
      scopes: ['*'],
      ipAllowlist: [],
      expiresAt: null,
      lastUsedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      revokedAt: null,
    } as never)
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([
      { id: 'key_test_001', name: 'Test Key', scopes: ['*'], ipAllowlist: [], lastUsedAt: null, expiresAt: null, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({ id: 'key_other_001', name: 'Other Key' } as never)
  })

  it('POST /v1/api-keys → 201 with raw key (no keyHash)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/api-keys',
      payload: { name: 'Integration Key', scopes: ['onramp:write', 'rates:read'] },
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.data.key).toMatch(/^pk_[0-9a-f]{64}$/)
    expect(body.data.keyHash).toBeUndefined()
    expect(body.data.name).toBe('Integration Key')
  })

  it('GET /v1/api-keys → 200 with key list (no keyHash)', async () => {
    const res = await server.inject({ method: 'GET', url: '/v1/api-keys', headers: authHeaders() })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    // Ensure keyHash is never exposed
    for (const key of body.data) {
      expect(key.keyHash).toBeUndefined()
    }
  })

  it('DELETE /v1/api-keys/:id → 400 when revoking own key', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/v1/api-keys/${mockApiKey.id}`,
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('SELF_REVOCATION')
  })

  it('DELETE /v1/api-keys/:id → 200 when revoking another key', async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.apiKey.update).mockResolvedValue({} as never)

    const res = await server.inject({
      method: 'DELETE',
      url: '/v1/api-keys/key_other_001',
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
  })
})

// ─── Authenticated: webhook delivery history ──────────────────────────────────

describe('Authenticated: webhook delivery history', () => {
  beforeEach(async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(mockApiKey as never)
    vi.mocked(prisma.webhook.findFirst).mockResolvedValue({ id: 'wh_001', customerId: TEST_CUSTOMER_ID } as never)
    vi.mocked(prisma.webhookDelivery.findMany).mockResolvedValue([
      { id: 'del_001', webhookId: 'wh_001', event: 'onramp.created', attempts: 1, succeededAt: new Date(), failedAt: null, createdAt: new Date() },
    ] as never)
  })

  it('GET /v1/webhooks/:id/deliveries → 200 with delivery array', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/v1/webhooks/wh_001/deliveries',
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data[0].event).toBe('onramp.created')
  })
})

// ─── Authenticated: GET /v1/otc list ─────────────────────────────────────────

describe('Authenticated: GET /v1/otc list', () => {
  beforeEach(async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(mockApiKey as never)
    vi.mocked(prisma.otcOrder.findMany).mockResolvedValue([
      {
        id: 'otc_001',
        customerId: TEST_CUSTOMER_ID,
        side: 'BUY',
        stablecoin: 'USDT',
        chain: 'TRON',
        amountIdr: '75000000',
        amountStablecoin: '4717.000000',
        rate: '15898.00000000',
        spreadBps: 30,
        status: 'QUOTED',
        expiresAt: new Date(Date.now() + 30_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never)
  })

  it('GET /v1/otc → 200 with array of orders', async () => {
    const res = await server.inject({ method: 'GET', url: '/v1/otc', headers: authHeaders() })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.data[0].status).toBe('QUOTED')
  })

  it('GET /v1/otc?status=QUOTED → 200 filtered list', async () => {
    const res = await server.inject({ method: 'GET', url: '/v1/otc?status=QUOTED', headers: authHeaders() })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
  })
})

// ─── Authenticated: POST /v1/offramp/verify-account ──────────────────────────

describe('Authenticated: POST /v1/offramp/verify-account', () => {
  beforeEach(async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(mockApiKey as never)
  })

  it('POST /v1/offramp/verify-account → 200 with valid + accountName', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/offramp/verify-account',
      payload: { bankCode: 'BCA', accountNumber: '1234567890' },
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.data.valid).toBe(true)
    expect(body.data.accountName).toBeTruthy()
  })
})

// ─── Authenticated: POST /v1/kyc/tier3 ───────────────────────────────────────

describe('Authenticated: POST /v1/kyc/tier3', () => {
  beforeEach(async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(mockApiKey as never)
    vi.mocked(prisma.kycRecord.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.kycRecord.create).mockResolvedValue({
      id: 'kyc_tier3_001',
      customerId: TEST_CUSTOMER_ID,
      tier: 'TIER3',
      status: 'PENDING',
      npwp: '123456789012345',
      companyName: 'PT Besar Sekali',
      notes: 'Manual review required. UBOs: John Doe',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)
  })

  it('POST /v1/kyc/tier3 → 202 PENDING', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/kyc/tier3',
      payload: {
        companyName: 'PT Besar Sekali',
        npwp: '123456789012345',
        uboNames: ['John Doe'],
      },
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(202)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.data.status).toBe('PENDING')
    expect(body.data.recordId).toBeTruthy()
    expect(body.data.message).toMatch(/review/i)
  })

  it('POST /v1/kyc/tier3 duplicate submission → 409', async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.kycRecord.findFirst).mockResolvedValue({
      id: 'kyc_tier3_001',
      tier: 'TIER3',
      status: 'PENDING',
    } as never)

    const res = await server.inject({
      method: 'POST',
      url: '/v1/kyc/tier3',
      payload: {
        companyName: 'PT Besar Sekali',
        npwp: '123456789012345',
        uboNames: ['John Doe'],
      },
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(409)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('ALREADY_SUBMITTED')
  })
})

// ─── Authenticated: Admin KYC Tier 3 review ──────────────────────────────────

describe('Authenticated: admin KYC Tier 3 review', () => {
  const pendingTier3Record = {
    id: 'kyc_tier3_001',
    customerId: TEST_CUSTOMER_ID,
    tier: 'TIER3',
    status: 'PENDING',
    npwp: '123456789012345',
    companyName: 'PT Besar Sekali',
    notes: 'Manual review required. UBOs: John Doe',
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewedAt: null,
  }

  beforeEach(async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(mockApiKey as never)
    vi.mocked(prisma.kycRecord.findUnique).mockResolvedValue(pendingTier3Record as never)
    vi.mocked(prisma.kycRecord.update).mockResolvedValue({ ...pendingTier3Record, status: 'APPROVED', reviewedAt: new Date() } as never)
    vi.mocked(prisma.customer.update).mockResolvedValue({} as never)
    vi.mocked(prisma.webhook.findMany).mockResolvedValue([])
  })

  it('PATCH /v1/admin/kyc/:id/review APPROVED → 200', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/v1/admin/kyc/kyc_tier3_001/review',
      payload: { decision: 'APPROVED' },
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.data.status).toBe('APPROVED')
  })

  it('PATCH /v1/admin/kyc/:id/review REJECTED → 200', async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.kycRecord.update).mockResolvedValue({ ...pendingTier3Record, status: 'REJECTED', reviewedAt: new Date() } as never)

    const res = await server.inject({
      method: 'PATCH',
      url: '/v1/admin/kyc/kyc_tier3_001/review',
      payload: { decision: 'REJECTED', notes: 'Incomplete UBO documentation' },
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.data.status).toBe('REJECTED')
  })

  it('PATCH /v1/admin/kyc/:id/review without admin:write scope → 403', async () => {
    // mockApiKey has scopes: ['*'] which includes admin:write, so use a restricted key
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
      ...mockApiKey,
      scopes: ['onramp:write'],
    } as never)

    const res = await server.inject({
      method: 'PATCH',
      url: '/v1/admin/kyc/kyc_tier3_001/review',
      payload: { decision: 'APPROVED' },
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(403)
  })

  it('GET /v1/admin/kyc/pending → 200 with pending records list', async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.kycRecord.findMany).mockResolvedValue([pendingTier3Record] as never)

    const res = await server.inject({
      method: 'GET',
      url: '/v1/admin/kyc/pending',
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data[0].tier).toBe('TIER3')
  })
})

// ─── AML screening block ──────────────────────────────────────────────────────

describe('AML: high-risk address blocks stablecoin dispatch', () => {
  beforeEach(async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(mockApiKey as never)
    vi.mocked(prisma.customer.findUniqueOrThrow).mockResolvedValue({ id: TEST_CUSTOMER_ID, name: 'Test Corp' } as never)
    vi.mocked(prisma.onrampOrder.create).mockResolvedValue({
      id: 'onramp_aml_001', customerId: TEST_CUSTOMER_ID, status: 'PENDING', createdAt: new Date(), updatedAt: new Date(),
    } as never)

    // Override AML mock to return high risk for this test
    const aml = await import('../../src/services/aml/chainalysis.js')
    vi.mocked(aml.screenAddress).mockResolvedValue({ address: '0xbad', risk: 'severe' })
    vi.mocked(aml.isHighRisk).mockReturnValue(true)
  })

  afterEach(async () => {
    // Restore low-risk default
    const aml = await import('../../src/services/aml/chainalysis.js')
    vi.mocked(aml.screenAddress).mockResolvedValue({ address: '0xtest', risk: 'low' })
    vi.mocked(aml.isHighRisk).mockReturnValue(false)
  })

  it('sendStablecoin to sanctioned address → 403', async () => {
    // sendStablecoin is called async by setImmediate in the onramp conversion worker,
    // not on the HTTP request path. We test the service directly here.
    const { sendStablecoin } = await import('../../src/services/blockchain/index.js')
    await expect(
      sendStablecoin({ chain: 'POLYGON' as never, to: '0xbad', amount: '100', stablecoin: 'USDT' as never })
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})

// ─── Auth: POST /v1/auth/register ────────────────────────────────────────────

describe('Auth: POST /v1/auth/register', () => {
  const MASTER_KEY = 'pintas-test-master-key-sprint8-32charlong!'

  beforeEach(async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.customer.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.customer.create).mockResolvedValue({
      id: 'cust_new_001',
      name: 'PT Maju Jaya',
      email: 'ops@majujaya.co.id',
      kybStatus: 'PENDING',
      tier: 'TIER1',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)
    vi.mocked(prisma.apiKey.create).mockResolvedValue({
      id: 'key_new_001',
      keyHash: 'hash',
      customerId: 'cust_new_001',
      name: 'Default Key',
      scopes: ['*'],
      ipAllowlist: [],
      revokedAt: null,
      expiresAt: null,
      lastUsedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)
  })

  it('POST /v1/auth/register with valid master key → 201 with API key', async () => {
    // Use the actual MASTER_API_KEY_SECRET from config (test env uses process.env or default)
    const res = await server.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { name: 'PT Maju Jaya', email: 'ops@majujaya.co.id' },
      headers: { Authorization: `Bearer ${process.env.MASTER_API_KEY_SECRET ?? MASTER_KEY}` },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.data.apiKey.key).toMatch(/^pk_/)
  })

  it('POST /v1/auth/register with wrong master key → 401', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { name: 'PT Test', email: 'test@test.co.id' },
      headers: { Authorization: 'Bearer wrong-key' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('POST /v1/auth/register with duplicate email → 409', async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.customer.findFirst).mockResolvedValue({
      id: 'cust_existing',
      email: 'ops@majujaya.co.id',
    } as never)

    const res = await server.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { name: 'PT Maju Jaya', email: 'ops@majujaya.co.id' },
      headers: { Authorization: `Bearer ${process.env.MASTER_API_KEY_SECRET ?? MASTER_KEY}` },
    })
    expect(res.statusCode).toBe(409)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('EMAIL_TAKEN')
  })

  it('POST /v1/auth/register without auth header → 401', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { name: 'PT Test', email: 'test@test.co.id' },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── M2: Exporters, Buyers, Payout Accounts ──────────────────────────────────

describe('Exporters: POST /v1/exporters', () => {
  it('creates an exporter → 201', async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.exporter.create).mockResolvedValue({
      id: 'exp_001', legalName: 'PT Ekspor Jaya', nib: '1234567890123',
      npwp: '123456789012345', country: 'ID', segment: 'FORK_B',
      kybStatus: 'PENDING', kybTier: 0, createdAt: new Date(), updatedAt: new Date(),
    } as never)
    const res = await server.inject({
      method: 'POST', url: '/v1/exporters',
      payload: { legalName: 'PT Ekspor Jaya', nib: '1234567890123', npwp: '123456789012345' },
      headers: { Authorization: 'Bearer test-api-key' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('exp_001')
    expect(body.data.kybStatus).toBe('PENDING')
  })

  it('rejects missing required fields → 400', async () => {
    const res = await server.inject({
      method: 'POST', url: '/v1/exporters',
      payload: { legalName: 'PT Ekspor Jaya' },
      headers: { Authorization: 'Bearer test-api-key' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('Exporters: POST /v1/exporters/:id/kyb', () => {
  it('approves KYB → 200 with APPROVED status', async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.exporter.findUnique).mockResolvedValue({
      id: 'exp_001', legalName: 'PT Ekspor Jaya', kybStatus: 'PENDING', kybTier: 0,
    } as never)
    vi.mocked(prisma.exporter.update).mockResolvedValue({
      id: 'exp_001', kybStatus: 'APPROVED', kybTier: 1,
    } as never)
    const res = await server.inject({
      method: 'POST', url: '/v1/exporters/exp_001/kyb',
      headers: { Authorization: 'Bearer test-api-key' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.kybStatus).toBe('APPROVED')
  })

  it('returns 404 for unknown exporter', async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.exporter.findUnique).mockResolvedValue(null)
    const res = await server.inject({
      method: 'POST', url: '/v1/exporters/unknown_id/kyb',
      headers: { Authorization: 'Bearer test-api-key' },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('Exporters: POST /v1/exporters/:id/payout-accounts', () => {
  it('creates a payout account with masked account number → 201', async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.exporter.findUnique).mockResolvedValue({ id: 'exp_001' } as never)
    vi.mocked(prisma.payoutAccount.create).mockResolvedValue({
      id: 'pa_001', exporterId: 'exp_001', type: 'OFFSHORE_USD',
      bankName: 'Bank of America', accountNumberMasked: '****6789',
      currency: 'USD', status: 'ACTIVE', createdAt: new Date(),
    } as never)
    const res = await server.inject({
      method: 'POST', url: '/v1/exporters/exp_001/payout-accounts',
      payload: {
        type: 'OFFSHORE_USD', bankName: 'Bank of America',
        accountNumber: '1234506789', accountRef: 'ref_bofa_001',
      },
      headers: { Authorization: 'Bearer test-api-key' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.data.accountNumberMasked).toBe('****6789')
    expect(body.data).not.toHaveProperty('accountNumber')
  })
})

describe('Buyers: POST /v1/buyers', () => {
  it('creates a buyer → 201', async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.buyer.create).mockResolvedValue({
      id: 'buy_001', exporterId: 'exp_001', legalName: 'Acme Corp',
      country: 'US', email: 'ap@acme.com', createdAt: new Date(), updatedAt: new Date(),
    } as never)
    const res = await server.inject({
      method: 'POST', url: '/v1/buyers',
      payload: { exporterId: 'exp_001', legalName: 'Acme Corp', country: 'US', email: 'ap@acme.com' },
      headers: { Authorization: 'Bearer test-api-key' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('buy_001')
  })

  it('rejects invalid email → 400', async () => {
    const res = await server.inject({
      method: 'POST', url: '/v1/buyers',
      payload: { exporterId: 'exp_001', legalName: 'Acme Corp', country: 'US', email: 'not-an-email' },
      headers: { Authorization: 'Bearer test-api-key' },
    })
    expect(res.statusCode).toBe(400)
  })
})

// ─── M3: Quotes and Pricing ───────────────────────────────────────────────────

describe('Quotes: POST /v1/quotes', () => {
  it('creates a quote for $10,000 → fee $50, net $9,950', async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.quote.create).mockResolvedValue({
      id: 'q_001', exporterId: 'exp_001',
      invoiceAmountCents: 1_000_000n, feeCents: 5_000n, netPayoutCents: 995_000n,
      pricingVersion: 'v1-example',
      expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date(), updatedAt: new Date(),
    } as never)
    const res = await server.inject({
      method: 'POST', url: '/v1/quotes',
      payload: { exporterId: 'exp_001', invoiceAmountUsd: '10000.00' },
      headers: { Authorization: 'Bearer test-api-key' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.data.invoiceAmountUsd).toBe('10000.00')
    expect(body.data.feeUsd).toBe('50.00')
    expect(body.data.netPayoutUsd).toBe('9950.00')
    expect(body.data.pricingVersion).toBe('v1-example')
    expect(body.data).toHaveProperty('expiresAt')
  })

  it('rejects zero amount → 400', async () => {
    const res = await server.inject({
      method: 'POST', url: '/v1/quotes',
      payload: { exporterId: 'exp_001', invoiceAmountUsd: '0.00' },
      headers: { Authorization: 'Bearer test-api-key' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects non-numeric amount → 400', async () => {
    const res = await server.inject({
      method: 'POST', url: '/v1/quotes',
      payload: { exporterId: 'exp_001', invoiceAmountUsd: 'abc' },
      headers: { Authorization: 'Bearer test-api-key' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('Quotes: GET /v1/quotes/:id', () => {
  it('returns 404 for unknown quote', async () => {
    const { prisma } = await import('../../src/db/client.js')
    vi.mocked(prisma.quote.findUnique).mockResolvedValue(null)
    const res = await server.inject({
      method: 'GET', url: '/v1/quotes/unknown_q',
      headers: { Authorization: 'Bearer test-api-key' },
    })
    expect(res.statusCode).toBe(404)
  })
})
