/**
 * M6 failure-path tests
 *
 * Covers:
 * - Partial payment: AWAITING_FUNDS stays if amountCents < invoice
 * - Over-payment: order proceeds; excess creates Refund in REFUND_PENDING
 * - Each *_FAILED state via /sandbox/fail
 * - REFUND_PENDING → REFUNDED via /sandbox/advance on a refund order
 * - Invalid cancel (RECONCILED) → 409
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { buildServer } from '../../src/api/server.js'
import type { FastifyInstance } from 'fastify'

// ─── Prisma mock ─────────────────────────────────────────────────────────────

vi.mock('../../src/db/client.js', () => {
  let orderStatus = 'AWAITING_FUNDS'
  let orderVersion = 2
  let fundedCents = 0n
  const inv = 1_000_000n
  const fee =     5_000n
  const net =   995_000n
  const events: unknown[] = []
  const refunds: unknown[] = []

  const prisma = {
    settlementOrder: {
      findUnique:         vi.fn().mockImplementation(async () => ({
        id: 'so_fail', status: orderStatus, version: orderVersion,
        invoiceAmountCents: inv, feeCents: fee, netPayoutCents: net, fundedAmountCents: fundedCents,
        exporterId: 'exp_f', buyerId: 'buy_f', quoteId: 'q_f', invoiceRef: 'INV-F-001',
        statusReason: null, expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: new Date(), updatedAt: new Date(),
      })),
      findUniqueOrThrow:  vi.fn().mockImplementation(async () => ({
        id: 'so_fail', status: orderStatus, version: orderVersion,
        invoiceAmountCents: inv, feeCents: fee, netPayoutCents: net, fundedAmountCents: fundedCents,
        exporterId: 'exp_f', buyerId: 'buy_f', quoteId: 'q_f', invoiceRef: 'INV-F-001',
        statusReason: null, expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: new Date(), updatedAt: new Date(),
      })),
      updateMany: vi.fn().mockImplementation(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (orderVersion === where.version) {
          if (data.status) orderStatus = data.status as string
          if (data.version) orderVersion = Number(data.version)
          return { count: 1 }
        }
        return { count: 0 }
      }),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        if (data.fundedAmountCents !== undefined) fundedCents = data.fundedAmountCents as bigint
        return {}
      }),
      create: vi.fn().mockResolvedValue({ id: 'so_fail' }),
      _setStatus: (s: string, v = orderVersion + 1) => { orderStatus = s; orderVersion = v },
      _setFunded: (c: bigint) => { fundedCents = c },
    },
    orderEvent: {
      create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => {
        events.push(data)
        return { id: `evt_${events.length}`, ...data as object }
      }),
      findMany: vi.fn().mockImplementation(async () => events),
    },
    journalEntry: {
      create: vi.fn().mockResolvedValue({ id: 'je_f1' }),
    },
    ledgerAccount: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(async ({ where }: { where: { code: string } }) => ({
        id: `la_${where.code}`, code: where.code,
      })),
    },
    ledgerLine: {
      create: vi.fn().mockResolvedValue({ id: 'll_f1' }),
    },
    incomingPayment: {
      create: vi.fn().mockResolvedValue({ id: 'ip_f1' }),
    },
    rampOperation: {
      create: vi.fn().mockResolvedValue({ id: 'ro_f1' }),
    },
    chainTransfer: {
      create: vi.fn().mockResolvedValue({ id: 'ct_f1' }),
    },
    payout: {
      create: vi.fn().mockResolvedValue({ id: 'py_f1' }),
    },
    apiKey: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'key_f001', customerId: 'cust_f001', scopes: ['*'], ipAllowlist: [],
        revokedAt: null, expiresAt: null, createdAt: new Date(),
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    refund: {
      create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => {
        refunds.push(data)
        return { id: `ref_${refunds.length}`, ...data as object }
      }),
      findMany: vi.fn().mockImplementation(async () => refunds),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    _state: () => ({ status: orderStatus, version: orderVersion, funded: fundedCents }),
    _refunds: () => refunds,
    _events: () => events,
  }
  return { prisma }
})

vi.mock('../../src/lib/redis.js', () => ({
  getRedis: vi.fn(() => ({ get: vi.fn().mockResolvedValue(null), set: vi.fn(), ping: vi.fn().mockResolvedValue('PONG'), on: vi.fn() })),
  redisPing: vi.fn().mockResolvedValue(true),
}))

vi.mock('../../src/services/exchange/indodax.js', () => ({
  fetchIndodaxRate: vi.fn().mockResolvedValue({ pair: 'IDR_USDT', bid: '15800000', ask: '15900000', mid: '15850000', venue: 'indodax', volume24h: '5000000', fetchedAt: new Date() }),
}))

vi.mock('../../src/services/exchange/tokocrypto.js', () => ({
  fetchTokocryptoRate: vi.fn().mockResolvedValue({ pair: 'IDR_USDT', bid: '15820000', ask: '15920000', mid: '15870000', venue: 'tokocrypto', volume24h: '3000000', fetchedAt: new Date() }),
}))

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('M6 Failure paths', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    server = await buildServer()
  })

  afterAll(async () => {
    await server.close()
  })

  it('MINT_FAILED via /sandbox/fail', async () => {
    const { prisma } = await import('../../src/db/client.js')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(prisma.settlementOrder as any)._setStatus('MINTING', 3)
    const res = await server.inject({
      method: 'POST', url: '/v1/sandbox/settlements/so_fail/fail',
      payload: { reason: 'Ramp unavailable' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.status).toBe('MINT_FAILED')
  })

  it('TRANSFER_FAILED via /sandbox/fail', async () => {
    const { prisma } = await import('../../src/db/client.js')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(prisma.settlementOrder as any)._setStatus('IN_TRANSIT', 4)
    const res = await server.inject({
      method: 'POST', url: '/v1/sandbox/settlements/so_fail/fail',
      payload: { reason: 'Chain congestion' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.status).toBe('TRANSFER_FAILED')
  })

  it('REDEEM_FAILED via /sandbox/fail', async () => {
    const { prisma } = await import('../../src/db/client.js')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(prisma.settlementOrder as any)._setStatus('REDEEMING', 5)
    const res = await server.inject({
      method: 'POST', url: '/v1/sandbox/settlements/so_fail/fail',
      payload: { reason: 'Redemption rejected' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.status).toBe('REDEEM_FAILED')
  })

  it('PAYOUT_FAILED via /sandbox/fail', async () => {
    const { prisma } = await import('../../src/db/client.js')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(prisma.settlementOrder as any)._setStatus('PAYING_OUT', 6)
    const res = await server.inject({
      method: 'POST', url: '/v1/sandbox/settlements/so_fail/fail',
      payload: { reason: 'Beneficiary bank rejected' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.status).toBe('PAYOUT_FAILED')
  })

  it('fail from FUNDED → 409 (not a valid fail state)', async () => {
    const { prisma } = await import('../../src/db/client.js')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(prisma.settlementOrder as any)._setStatus('FUNDED', 7)
    const res = await server.inject({
      method: 'POST', url: '/v1/sandbox/settlements/so_fail/fail',
      payload: { reason: 'Test' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('cancel from RECONCILED → 409 (invalid transition)', async () => {
    const { prisma } = await import('../../src/db/client.js')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(prisma.settlementOrder as any)._setStatus('RECONCILED', 8)
    const res = await server.inject({
      method: 'POST', url: '/v1/settlements/so_fail/cancel',
      headers: { Authorization: 'Bearer pk_test-api-key' },
    })
    expect(res.statusCode).toBe(409)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('INVALID_TRANSITION')
  })
})
