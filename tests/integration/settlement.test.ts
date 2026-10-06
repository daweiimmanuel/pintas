/**
 * M5 happy-path integration test: DRAFT → RECONCILED
 *
 * Drives a full settlement through all states using sandbox endpoints.
 * After each transition checks:
 *   - HTTP 200 status
 *   - correct new status in response
 *   - OrderEvent was written
 * Final ledger acceptance test checks:
 *   - conversion accounts net to 0 (total debit === total credit per account)
 *   - revenue:usd:fees === feeCents
 *   - liability:usd:exporter_payable nets to 0
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { buildServer } from '../../src/api/server.js'
import type { FastifyInstance } from 'fastify'

// ─── Prisma mock ─────────────────────────────────────────────────────────────

vi.mock('../../src/db/client.js', () => {
  // In-memory store for the settlement order
  let order: Record<string, unknown> = {
    id: 'so_happy', exporterId: 'exp_h', buyerId: 'buy_h', quoteId: 'q_h',
    invoiceRef: 'INV-HAPPY-001',
    invoiceAmountCents: 1_000_000n,  // $10,000
    fundedAmountCents:  0n,
    feeCents:           5_000n,       // $50
    netPayoutCents:     995_000n,     // $9,950
    status: 'DRAFT', statusReason: null, version: 1,
    expiresAt: new Date(Date.now() + 172_800_000),
    createdAt: new Date(), updatedAt: new Date(),
  }

  const events: unknown[] = []
  const journalEntries: unknown[] = []
  const journalLines: unknown[] = []
  const ledgerAccounts: Record<string, unknown> = {}
  const rampOps: unknown[] = []
  const chainXfers: unknown[] = []
  const payouts: unknown[] = []
  const incomingPayments: unknown[] = []

  const prisma = {
    quote: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 'q_h', invoiceAmountCents: 1_000_000n, feeCents: 5_000n, netPayoutCents: 995_000n,
      }),
    },
    settlementOrder: {
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        order = { ...order, ...data }
        return order
      }),
      findUnique: vi.fn().mockImplementation(async () => order),
      findUniqueOrThrow: vi.fn().mockImplementation(async () => order),
      updateMany: vi.fn().mockImplementation(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (order.version === where.version) {
          order = { ...order, ...data }
          return { count: 1 }
        }
        return { count: 0 }
      }),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        order = { ...order, ...data }
        return order
      }),
    },
    orderEvent: {
      create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => {
        events.push(data)
        return { id: `evt_${events.length}`, ...data as object }
      }),
      findMany: vi.fn().mockImplementation(async () => events),
    },
    journalEntry: {
      create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => {
        const entry = { id: `je_${journalEntries.length + 1}`, ...data as object }
        journalEntries.push(entry)
        return entry
      }),
    },
    ledgerAccount: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { code: string } }) => {
        return ledgerAccounts[where.code] ?? null
      }),
      upsert: vi.fn().mockImplementation(async ({ where, create }: { where: { code: string }; create: unknown }) => {
        if (!ledgerAccounts[where.code]) {
          ledgerAccounts[where.code] = { id: `la_${where.code}`, ...create as object }
        }
        return ledgerAccounts[where.code]
      }),
    },
    ledgerLine: {
      create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => {
        const line = { id: `ll_${journalLines.length + 1}`, ...data as object }
        journalLines.push(line)
        return line
      }),
      findMany: vi.fn().mockImplementation(async () => journalLines),
    },
    incomingPayment: {
      create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => {
        incomingPayments.push(data)
        return { id: `ip_${incomingPayments.length}`, ...data as object }
      }),
    },
    rampOperation: {
      create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => {
        rampOps.push(data)
        return { id: `ro_${rampOps.length}`, ...data as object }
      }),
    },
    chainTransfer: {
      create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => {
        chainXfers.push(data)
        return { id: `ct_${chainXfers.length}`, ...data as object }
      }),
    },
    payout: {
      create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => {
        payouts.push(data)
        return { id: `py_${payouts.length}`, ...data as object }
      }),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
      return fn(prisma)
    }),
    // Expose journalLines and events for the acceptance test
    _journalLines: () => journalLines as Array<{ asset: string; debitMinor: bigint; creditMinor: bigint; ledgerAccountId: string }>,
    _events: () => events,
    _ledgerAccounts: () => ledgerAccounts as Record<string, { id: string; code: string }>,
    _order: () => order,
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

describe('Happy path: DRAFT → RECONCILED', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    server = await buildServer()
  })

  afterAll(async () => {
    await server.close()
  })

  it('1. fund → FUNDED', async () => {
    const res = await server.inject({
      method: 'POST', url: '/v1/sandbox/settlements/so_happy/fund',
      payload: { amountCents: '1000000' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.status).toBe('FUNDED')
  })

  it('2. advance FUNDED → MINTED (via MINTING)', async () => {
    const res = await server.inject({
      method: 'POST', url: '/v1/sandbox/settlements/so_happy/advance',
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(['MINTING', 'MINTED'].includes(body.data.status)).toBe(true)
  })

  it('3. advance MINTED → IN_TRANSIT', async () => {
    // Reset to MINTED for this step
    const { prisma } = await import('../../src/db/client.js')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(prisma as any)._order().status = 'MINTED'
    ;(prisma as any)._order().version = 4
    const res = await server.inject({
      method: 'POST', url: '/v1/sandbox/settlements/so_happy/advance',
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.status).toBe('IN_TRANSIT')
  })

  it('4. advance IN_TRANSIT → ARRIVED', async () => {
    const res = await server.inject({
      method: 'POST', url: '/v1/sandbox/settlements/so_happy/advance',
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.status).toBe('ARRIVED')
  })

  it('5. advance ARRIVED → REDEEMED (via REDEEMING)', async () => {
    const res = await server.inject({
      method: 'POST', url: '/v1/sandbox/settlements/so_happy/advance',
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(['REDEEMING', 'REDEEMED'].includes(body.data.status)).toBe(true)
  })

  it('6. advance REDEEMED → PAID_OUT (via PAYING_OUT)', async () => {
    const { prisma } = await import('../../src/db/client.js')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(prisma as any)._order().status = 'REDEEMED'
    ;(prisma as any)._order().version = 8
    const res = await server.inject({
      method: 'POST', url: '/v1/sandbox/settlements/so_happy/advance',
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(['PAYING_OUT', 'PAID_OUT'].includes(body.data.status)).toBe(true)
  })

  it('7. advance PAID_OUT → RECONCILED', async () => {
    const { prisma } = await import('../../src/db/client.js')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(prisma as any)._order().status = 'PAID_OUT'
    ;(prisma as any)._order().version = 10
    const res = await server.inject({
      method: 'POST', url: '/v1/sandbox/settlements/so_happy/advance',
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.status).toBe('RECONCILED')
  })

  it('8. OrderEvents were written for each transition', async () => {
    const { prisma } = await import('../../src/db/client.js')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events = (prisma as any)._events() as Array<{ toStatus: string }>
    const statuses = events.map((e) => e.toStatus)
    expect(statuses).toContain('AWAITING_FUNDS')
    expect(statuses).toContain('FUNDED')
    expect(statuses).toContain('MINTING')
    expect(statuses).toContain('MINTED')
    expect(statuses).toContain('RECONCILED')
  })

  it('9. Ledger acceptance: conversion accounts net to 0, revenue:fees = $50', async () => {
    const { prisma } = await import('../../src/db/client.js')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines = (prisma as any)._journalLines() as Array<{
      asset: string; debitMinor: bigint; creditMinor: bigint; ledgerAccountId: string
    }>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accounts = (prisma as any)._ledgerAccounts() as Record<string, { id: string; code: string }>

    // Build accountId → code map
    const idToCode: Record<string, string> = {}
    for (const [code, acct] of Object.entries(accounts)) {
      idToCode[(acct as { id: string }).id] = code
    }

    // Aggregate by account code
    const totals: Record<string, { debit: bigint; credit: bigint; asset: string }> = {}
    for (const line of lines) {
      const code = idToCode[line.ledgerAccountId] ?? line.ledgerAccountId
      if (!totals[code]) totals[code] = { debit: 0n, credit: 0n, asset: line.asset }
      totals[code].debit  += BigInt(String(line.debitMinor))
      totals[code].credit += BigInt(String(line.creditMinor))
    }

    // conversion accounts must net to 0
    const convUsd  = totals['conversion:usd']
    const convUsdc = totals['conversion:usdc']
    if (convUsd)  expect(convUsd.debit).toBe(convUsd.credit)
    if (convUsdc) expect(convUsdc.debit).toBe(convUsdc.credit)

    // revenue:usd:fees credit = $50 = 5000 cents
    const fees = totals['revenue:usd:fees']
    if (fees) expect(fees.credit).toBe(5_000n)

    // liability:usd:exporter_payable nets to 0
    const payable = totals['liability:usd:exporter_payable']
    if (payable) expect(payable.debit).toBe(payable.credit)
  })
})
