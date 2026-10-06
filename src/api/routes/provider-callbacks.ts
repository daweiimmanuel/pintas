import crypto from 'crypto'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/client.js'
import { transition } from '../../modules/settlements/state-machine.js'

// Inbound webhook from collection provider (e.g., virtual account payment notification).
// No auth required — verified by HMAC signature.
const providerCallbackRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/callbacks/collection/:provider', {
    config: { rawBody: true },
    schema: {
      tags: ['settlements'],
      summary: 'Inbound collection provider webhook',
      params: {
        type: 'object', required: ['provider'],
        properties: { provider: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    const { provider } = z.object({ provider: z.string() }).parse(req.params)

    // ── Signature verification ─────────────────────────────────────────────
    const sigHeader = req.headers['x-pintas-signature'] as string | undefined
    const webhookSecret = process.env.COLLECTION_WEBHOOK_SECRET ?? ''

    if (!sigHeader || !webhookSecret) {
      return reply.code(401).send({
        success: false,
        error: { code: 'MISSING_SIGNATURE', message: 'Webhook signature required' },
      })
    }

    // Expected format: t=<timestamp>,v1=<hex>
    const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')))
    const timestamp = parts['t']
    const signature = parts['v1']

    if (!timestamp || !signature) {
      return reply.code(401).send({
        success: false,
        error: { code: 'INVALID_SIGNATURE', message: 'Malformed signature header' },
      })
    }

    const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(req.body)
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex')

    // Constant-time comparison to prevent timing attacks
    const sigBuf = Buffer.from(signature, 'hex')
    const expBuf = Buffer.from(expected, 'hex')
    if (
      sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)
    ) {
      return reply.code(401).send({
        success: false,
        error: { code: 'INVALID_SIGNATURE', message: 'Signature mismatch' },
      })
    }

    // ── Parse event body ───────────────────────────────────────────────────
    const body = z.object({
      providerPaymentId: z.string(),
      paymentReference: z.string(),
      amountCents: z.string(),
      payerName: z.string().optional(),
      receivedAt: z.string().optional(),
    }).parse(req.body)

    const amount = BigInt(body.amountCents)

    // ── Deduplication — providerPaymentId is @unique ───────────────────────
    const existing = await prisma.incomingPayment.findUnique({
      where: { providerPaymentId: body.providerPaymentId },
    })
    if (existing) {
      return reply.code(200).send({ success: true, data: { duplicate: true } })
    }

    // ── Match order by paymentReference ───────────────────────────────────
    const instruction = await prisma.collectionInstruction.findUnique({
      where: { paymentReference: body.paymentReference },
    })

    await prisma.incomingPayment.create({
      data: {
        provider,
        providerPaymentId: body.providerPaymentId,
        amountCents: amount,
        orderId: instruction?.orderId ?? null,
        payerName: body.payerName ?? null,
        receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
        matchStatus: instruction ? 'MATCHED' : 'UNMATCHED',
      },
    })

    if (!instruction) {
      return reply.code(200).send({ success: true, data: { matched: false } })
    }

    const order = await prisma.settlementOrder.findUniqueOrThrow({
      where: { id: instruction.orderId },
    })

    const newFunded = (order.fundedAmountCents as bigint) + amount
    await prisma.settlementOrder.update({
      where: { id: order.id },
      data: { fundedAmountCents: newFunded },
    })

    if (['DRAFT', 'AWAITING_FUNDS'].includes(order.status)) {
      await transition(order.id, 'AWAITING_FUNDS', {
        trigger: 'collection_webhook',
        actor: `provider:${provider}`,
        payload: { providerPaymentId: body.providerPaymentId, amountCents: body.amountCents },
      }).catch(() => {}) // may already be in AWAITING_FUNDS

      if (newFunded >= (order.invoiceAmountCents as bigint)) {
        await transition(order.id, 'FUNDED', {
          trigger: 'collection_webhook',
          actor: `provider:${provider}`,
        })
      }
    }

    return reply.code(200).send({ success: true, data: { matched: true, orderId: order.id } })
  })
}

export default providerCallbackRoutes
