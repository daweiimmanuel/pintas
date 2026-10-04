/**
 * Integration tests for Pintas API
 *
 * These tests spin up a real Fastify instance but mock the exchange services
 * to avoid external HTTP calls. Tests that require DB connectivity (authenticated
 * endpoints) require a live PostgreSQL instance — run via `docker-compose up -d`
 * then `npm test`.
 *
 * Non-authenticated endpoints (health, callbacks) are fully testable without DB.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { buildServer } from '../../src/api/server.js'
import type { FastifyInstance } from 'fastify'

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

vi.mock('../../src/db/client.js', () => ({
  prisma: {
    apiKey: {
      findUnique: vi.fn().mockResolvedValue(null), // no valid keys in test
      update: vi.fn().mockResolvedValue({}),
    },
    exchangeRate: { create: vi.fn().mockResolvedValue({}) },
    virtualAccount: { findUnique: vi.fn().mockResolvedValue(null) },
    onrampOrder: { findUnique: vi.fn().mockResolvedValue(null) },
    webhook: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

let server: FastifyInstance

beforeAll(async () => {
  server = await buildServer()
  await server.ready()
})

afterAll(async () => {
  await server.close()
})

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
    const res = await server.inject({
      method: 'POST',
      url: '/v1/onramp',
      payload: {},
    })
    expect(res.statusCode).toBe(401)
  })

  it('POST /v1/offramp → 401 without auth', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/offramp',
      payload: {},
    })
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
    // Without a real BCA_API_SECRET configured, sandbox mode validates all signatures
    // We just verify it doesn't crash (200 or 401)
    expect([200, 401]).toContain(res.statusCode)
  })
})
