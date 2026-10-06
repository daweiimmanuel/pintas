import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/client.js'
import { transition } from '../../modules/settlements/state-machine.js'
import {
  getCollectionProvider, getRampProvider, getChainProvider, getPayoutProvider,
} from '../../providers/index.js'
import { centsToMicroUsdc } from '../../lib/money.js'
import type { SettlementStatus } from '@prisma/client'

const sandboxRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/sandbox/settlements/:id/fund
  // Simulate a buyer payment arriving via the collection provider.
  fastify.post('/sandbox/settlements/:id/fund', {
    config: { skipAuth: true },
    schema: {
      tags: ['sandbox'],
      summary: 'Simulate buyer payment for a settlement order',
      params: {
        type: 'object', required: ['id'], properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object', required: ['amountCents'],
        properties: { amountCents: { type: 'string', description: 'Amount in USD cents as string, e.g. "1000000"' } },
      },
    },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const { amountCents } = z.object({ amountCents: z.string() }).parse(req.body)
    const amount = BigInt(amountCents)

    const order = await prisma.settlementOrder.findUniqueOrThrow({ where: { id } })

    // Record the incoming payment
    await prisma.incomingPayment.create({
      data: {
        orderId: id,
        provider: 'mock',
        providerPaymentId: `sandbox-${id}-${Date.now()}`,
        amountCents: amount,
        receivedAt: new Date(),
        matchStatus: 'MATCHED',
      },
    })

    // Update funded amount and transition to AWAITING_FUNDS then FUNDED
    await prisma.settlementOrder.update({
      where: { id },
      data: { fundedAmountCents: (order.fundedAmountCents as bigint) + amount },
    })

    let updatedOrder = order
    if (order.status === 'DRAFT') {
      updatedOrder = await transition(id, 'AWAITING_FUNDS', { trigger: 'sandbox.fund', actor: 'sandbox' })
    }
    if (updatedOrder.status === 'AWAITING_FUNDS') {
      updatedOrder = await transition(id, 'FUNDED', { trigger: 'sandbox.fund', actor: 'sandbox' })
    }

    return reply.send({ success: true, data: { orderId: id, status: updatedOrder.status, amountCents: amountCents } })
  })

  // POST /v1/sandbox/settlements/:id/advance
  // Advance the order through the next provider step.
  fastify.post('/sandbox/settlements/:id/advance', {
    config: { skipAuth: true },
    schema: {
      tags: ['sandbox'],
      summary: 'Advance settlement order to next step (mock provider)',
      params: {
        type: 'object', required: ['id'], properties: { id: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const order = await prisma.settlementOrder.findUniqueOrThrow({ where: { id } })
    const status = order.status as SettlementStatus
    const amountMicro = centsToMicroUsdc(order.netPayoutCents as bigint)

    let nextStatus: SettlementStatus | null = null

    switch (status) {
      case 'FUNDED': {
        const ramp = getRampProvider()
        const result = await ramp.mint(id, amountMicro)
        await prisma.rampOperation.create({
          data: { orderId: id, type: 'MINT', provider: 'mock', providerRef: result.providerRef, amountMicroUsdc: amountMicro, status: result.status },
        })
        await transition(id, 'MINTING', { trigger: 'sandbox.advance', actor: 'sandbox' })
        nextStatus = 'MINTED'
        await transition(id, 'MINTED', { trigger: 'sandbox.advance', actor: 'sandbox' })
        break
      }
      case 'MINTED': {
        const chain = getChainProvider()
        const result = await chain.transfer(id, 'mock-destination-address', amountMicro)
        await prisma.chainTransfer.create({
          data: { orderId: id, chain: 'POLYGON', fromAddress: 'mock-source', toAddress: 'mock-destination-address', amountMicroUsdc: amountMicro, txHash: result.txHash, confirmations: 12, status: 'CONFIRMED' },
        })
        nextStatus = 'IN_TRANSIT'
        await transition(id, 'IN_TRANSIT', { trigger: 'sandbox.advance', actor: 'sandbox' })
        break
      }
      case 'IN_TRANSIT':
        nextStatus = 'ARRIVED'
        await transition(id, 'ARRIVED', { trigger: 'sandbox.advance', actor: 'sandbox' })
        break
      case 'ARRIVED': {
        const ramp = getRampProvider()
        const result = await ramp.redeem(id, amountMicro)
        await prisma.rampOperation.create({
          data: { orderId: id, type: 'REDEEM', provider: 'mock', providerRef: result.providerRef, amountMicroUsdc: amountMicro, status: result.status },
        })
        await transition(id, 'REDEEMING', { trigger: 'sandbox.advance', actor: 'sandbox' })
        nextStatus = 'REDEEMED'
        await transition(id, 'REDEEMED', { trigger: 'sandbox.advance', actor: 'sandbox' })
        break
      }
      case 'REDEEMED': {
        const payout = getPayoutProvider()
        const result = await payout.payout(id, 'mock-account-ref', order.netPayoutCents as bigint)
        await prisma.payout.create({
          data: { orderId: id, payoutAccountId: 'mock-payout-acct', provider: 'mock', providerRef: result.providerRef, amountCents: order.netPayoutCents as bigint, status: result.status },
        })
        await transition(id, 'PAYING_OUT', { trigger: 'sandbox.advance', actor: 'sandbox' })
        nextStatus = 'PAID_OUT'
        await transition(id, 'PAID_OUT', { trigger: 'sandbox.advance', actor: 'sandbox' })
        break
      }
      case 'PAID_OUT':
        nextStatus = 'RECONCILED'
        await transition(id, 'RECONCILED', { trigger: 'sandbox.advance', actor: 'sandbox' })
        break
      default:
        return reply.code(409).send({ success: false, error: { code: 'INVALID_STATE', message: `Cannot advance from status ${status}` } })
    }

    const updated = await prisma.settlementOrder.findUniqueOrThrow({ where: { id } })
    return reply.send({ success: true, data: { orderId: id, status: updated.status, prevStatus: status } })
  })

  // POST /v1/sandbox/settlements/:id/fail
  fastify.post('/sandbox/settlements/:id/fail', {
    config: { skipAuth: true },
    schema: {
      tags: ['sandbox'],
      summary: 'Simulate a failure at the current step',
      params: {
        type: 'object', required: ['id'], properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object', required: ['reason'],
        properties: { reason: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const { reason } = z.object({ reason: z.string() }).parse(req.body)
    const order = await prisma.settlementOrder.findUniqueOrThrow({ where: { id } })
    const status = order.status as SettlementStatus

    const FAIL_MAP: Partial<Record<SettlementStatus, SettlementStatus>> = {
      MINTING:   'MINT_FAILED',
      IN_TRANSIT: 'TRANSFER_FAILED',
      REDEEMING:  'REDEEM_FAILED',
      PAYING_OUT: 'PAYOUT_FAILED',
    }
    const failStatus = FAIL_MAP[status]
    if (!failStatus) {
      return reply.code(409).send({ success: false, error: { code: 'INVALID_STATE', message: `Cannot fail from status ${status}` } })
    }
    await transition(id, failStatus, { trigger: 'sandbox.fail', actor: 'sandbox', reason })
    return reply.send({ success: true, data: { orderId: id, status: failStatus, reason } })
  })
}

export default sandboxRoutes
