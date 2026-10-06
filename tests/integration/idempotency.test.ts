/**
 * M8 Idempotency + Inbound Webhook Hardening tests
 *
 * Covers:
 * - Missing Idempotency-Key → 400
 * - Second request with same key + same body → replays cached response
 * - Key reuse with different body → 422
 * - Inbound collection webhook: missing signature → 401
 * - Inbound collection webhook: bad signature → 401
 * - Inbound collection webhook: duplicate event → 200 no-op
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { buildServer } from '../../src/api/server.js'
import type { FastifyInstance } from 'fastify'
import crypto from 'crypto'

// ─── Prisma mock ─────────────────────────────────────────────────────────────

vi.mock('../../src/db/client.js', () => {
  const idempotencyStore = new Map<string, { key: string; route: string; requestHash: string; responseJson: unknown; expiresAt: Date; createdAt: Date }>()
  const incomingPayments = new Map<string, unknown>()

  const prisma = {
    idempotencyKey: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { key: string } }) =>
        idempotencyStore.get(where.key) ?? null
      ),
      upsert: vi.fn().mockImplementation(async ({ where, create, update }: {
        where: { key: string }; create: { key: string; route: string; requestHash: string; responseJson: unknown; expiresAt: Date }; update: unknown
      }) => {
        const existing = idempotencyStore.get(where.key)
        const record = existing
          ? { ...existing, ...(update as object) }
          : { ...create, createdAt: new Date() }
        idempotencyStore.set(where.key, record as typeof record & { createdAt: Date })
        return record
      }),
    },
    incomingPayment: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { providerPaymentId?: string } }) => {
        if (where.providerPaymentId) return incomingPayments.get(where.providerPaymentId) ?? null
        return null
      }),
      create: vi.fn().mockImplementation(async ({ data }: { data: { providerPaymentId: string } }) => {
        incomingPayments.set(data.providerPaymentId, data)
        return { id: 'ip_test', ...data }
      }),
    },
    collectionInstruction: {
      findUnique: vi.fn().mockResolvedValue(null), // no match → UNMATCHED
    },
    settlementOrder: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 'so_test', status: 'AWAITING_FUNDS', version: 1,
        invoiceAmountCents: 1_000_000n, feeCents: 5_000n, netPayoutCents: 995_000n,
        fundedAmountCents: 0n, exporterId: 'exp_x', buyerId: 'buy_x', quoteId: 'q_x',
        invoiceRef: 'INV-X-001', statusReason: null,
        expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: new Date(), updatedAt: new Date(),
      }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    orderEvent: { create: vi.fn().mockResolvedValue({ id: 'evt_x' }) },
    journalEntry: { create: vi.fn().mockResolvedValue({ id: 'je_x' }) },
    ledgerAccount: {
      upsert: vi.fn().mockImplementation(async ({ where }: { where: { code: string } }) => ({
        id: `la_${where.code}`, code: where.code,
      })),
    },
    ledgerLine: { create: vi.fn().mockResolvedValue({ id: 'll_x' }) },
    // Exporter create — used by idempotency test
    exporter: {
      create: vi.fn().mockResolvedValue({
        id: 'exp_new', legalName: 'Idn Corp', nib: '1234567890123',
        npwp: '001234567890000', country: 'ID', segment: 'FORK_B',
        kybStatus: 'PENDING', kybTier: 0, createdAt: new Date(), updatedAt: new Date(),
      }),
    },
    apiKey: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'key_x', customerId: 'cust_x', scopes: ['*'], ipAllowlist: [],
        revokedAt: null, expiresAt: null, createdAt: new Date(),
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  }
  return { prisma }
})

vi.mock('../../src/lib/redis.js', () => ({
  getRedis: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
    on: vi.fn(),
  })),
  redisPing: vi.fn().mockResolvedValue(true),
}))

vi.mock('../../src/services/exchange/indodax.js', () => ({
  fetchIndodaxRate: vi.fn().mockResolvedValue({ pair: 'IDR_USDT', bid: '15800000', ask: '15900000', mid: '15850000', venue: 'indodax', volume24h: '5000000', fetchedAt: new Date() }),
}))

vi.mock('../../src/services/exchange/tokocrypto.js', () => ({
  fetchTokocryptoRate: vi.fn().mockResolvedValue({ pair: 'IDR_USDT', bid: '15820000', ask: '15920000', mid: '15870000', venue: 'tokocrypto', volume24h: '3000000', fetchedAt: new Date() }),
}))

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('M8 Idempotency middleware', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    server = await buildServer()
  })

  afterAll(async () => {
    await server.close()
  })

  it('POST /v1/exporters without Idempotency-Key → 400', async () => {
    const res = await server.inject({
      method: 'POST', url: '/v1/exporters',
      headers: { Authorization: 'Bearer pk_test-api-key', 'Content-Type': 'application/json' },
      payload: { legalName: 'Test Corp', nib: '1234567890123', npwp: '001234567890000' },
    })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('MISSING_IDEMPOTENCY_KEY')
  })

  it('same key + same body → replays 201 response', async () => {
    const key = `idem-${Date.now()}`
    const payload = { legalName: 'Replay Corp', nib: '1234567890123', npwp: '001234567890000' }

    const res1 = await server.inject({
      method: 'POST', url: '/v1/exporters',
      headers: {
        Authorization: 'Bearer pk_test-api-key',
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      payload,
    })
    expect(res1.statusCode).toBe(201)

    const res2 = await server.inject({
      method: 'POST', url: '/v1/exporters',
      headers: {
        Authorization: 'Bearer pk_test-api-key',
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      payload,
    })
    expect(res2.statusCode).toBe(201)
    expect(JSON.parse(res2.body)).toEqual(JSON.parse(res1.body))
  })

  it('same key + different body → 422', async () => {
    const key = `idem-reuse-${Date.now()}`

    // First request
    await server.inject({
      method: 'POST', url: '/v1/exporters',
      headers: {
        Authorization: 'Bearer pk_test-api-key',
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      payload: { legalName: 'Corp A', nib: '1234567890123', npwp: '001234567890000' },
    })

    // Second request with different body
    const res2 = await server.inject({
      method: 'POST', url: '/v1/exporters',
      headers: {
        Authorization: 'Bearer pk_test-api-key',
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      payload: { legalName: 'Corp B', nib: '9876543210987', npwp: '009876543210000' },
    })
    expect(res2.statusCode).toBe(422)
    expect(JSON.parse(res2.body).error.code).toBe('IDEMPOTENCY_KEY_REUSED')
  })
})

describe('M8 Inbound collection webhook hardening', () => {
  let server: FastifyInstance
  const webhookSecret = 'test-webhook-secret-abc123'

  beforeAll(async () => {
    process.env.COLLECTION_WEBHOOK_SECRET = webhookSecret
    server = await buildServer()
  })

  afterAll(async () => {
    delete process.env.COLLECTION_WEBHOOK_SECRET
    await server.close()
  })

  function sign(body: string): string {
    const ts = Math.floor(Date.now() / 1000).toString()
    const sig = crypto.createHmac('sha256', webhookSecret).update(`${ts}.${body}`).digest('hex')
    return `t=${ts},v1=${sig}`
  }

  it('missing signature → 401', async () => {
    const res = await server.inject({
      method: 'POST', url: '/v1/callbacks/collection/mock',
      headers: { 'Content-Type': 'application/json' },
      payload: { providerPaymentId: 'pp_001', paymentReference: 'PNT-so_test', amountCents: '100000' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('bad signature → 401', async () => {
    const payload = JSON.stringify({ providerPaymentId: 'pp_002', paymentReference: 'PNT-so_test', amountCents: '100000' })
    const ts = Math.floor(Date.now() / 1000).toString()
    const badSig = `t=${ts},v1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef`
    const res = await server.inject({
      method: 'POST', url: '/v1/callbacks/collection/mock',
      headers: { 'Content-Type': 'application/json', 'x-pintas-signature': badSig },
      payload,
    })
    expect(res.statusCode).toBe(401)
  })

  it('valid signature, new event → 200 matched=false (no matching order)', async () => {
    const payload = JSON.stringify({ providerPaymentId: 'pp_003', paymentReference: 'PNT-so_test', amountCents: '100000' })
    const res = await server.inject({
      method: 'POST', url: '/v1/callbacks/collection/mock',
      headers: { 'Content-Type': 'application/json', 'x-pintas-signature': sign(payload) },
      payload,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
  })

  it('duplicate providerPaymentId → 200 no-op', async () => {
    const { prisma } = await import('../../src/db/client.js')
    // Pre-seed an existing payment with a unique ID
    vi.mocked(prisma.incomingPayment.findUnique).mockResolvedValueOnce({ id: 'ip_dup' } as never)

    const payload = JSON.stringify({ providerPaymentId: 'pp_dup', paymentReference: 'PNT-so_test', amountCents: '100000' })
    const createCallsBefore = vi.mocked(prisma.incomingPayment.create).mock.calls.length

    const res = await server.inject({
      method: 'POST', url: '/v1/callbacks/collection/mock',
      headers: { 'Content-Type': 'application/json', 'x-pintas-signature': sign(payload) },
      payload,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.duplicate).toBe(true)
    // Confirm no new IncomingPayment was created for this duplicate call
    expect(vi.mocked(prisma.incomingPayment.create).mock.calls.length).toBe(createCallsBefore)
  })
})
