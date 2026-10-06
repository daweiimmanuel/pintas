import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  createOfframpOrder,
  handleDisbursementCallback,
} from '../../services/settlement/offramp.js'
import { validateDurianpayWebhook, verifyBankAccount } from '../../services/disbursement/index.js'
import { Stablecoin, Chain, DisbursementType } from '../../types/index.js'
import { prisma } from '../../db/client.js'

const EWALLET_CODES = ['GOPAY', 'OVO', 'DANA', 'SHOPEEPAY', 'LINKAJA'] as const

const offrampRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/offramp — create off-ramp order (stablecoin → IDR)
  fastify.post('/offramp', {
    schema: {
      tags: ['offramp'],
      summary: 'Create a stablecoin → IDR off-ramp order (bank transfer or e-wallet)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['amountStablecoin', 'disbursementType'],
        properties: {
          amountStablecoin: { type: 'string', description: 'Stablecoin amount (minimum 1)' },
          stablecoin: { type: 'string', enum: ['USDT', 'USDC'], default: 'USDT' },
          chain: { type: 'string', enum: ['POLYGON', 'TRON', 'STELLAR', 'ETHEREUM'], default: 'POLYGON' },
          disbursementType: { type: 'string', enum: ['BANK_TRANSFER', 'EWALLET'], description: 'Payout method' },
          bankCode: { type: 'string', description: 'Required for BANK_TRANSFER (e.g. BCA, MANDIRI)' },
          accountNumber: { type: 'string', description: 'Required for BANK_TRANSFER' },
          accountName: { type: 'string', description: 'Required for BANK_TRANSFER' },
          ewalletCode: { type: 'string', enum: ['GOPAY', 'OVO', 'DANA', 'SHOPEEPAY', 'LINKAJA'], description: 'Required for EWALLET' },
          ewalletPhone: { type: 'string', description: 'Required for EWALLET (format: 08xxxxxxxxxx)' },
          referenceId: { type: 'string', maxLength: 64 },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
    },
  }, async (req, reply) => {
    const bankSchema = z.object({
      amountStablecoin: z.string().regex(/^\d+(\.\d+)?$/).refine(
        (v) => parseFloat(v) >= 1,
        'Minimum off-ramp is 1 USDT/USDC'
      ),
      stablecoin: z.nativeEnum(Stablecoin).default(Stablecoin.USDT),
      chain: z.nativeEnum(Chain).default(Chain.POLYGON),
      disbursementType: z.nativeEnum(DisbursementType),
      bankCode: z.string().optional(),
      accountNumber: z.string().optional(),
      accountName: z.string().optional(),
      ewalletCode: z.enum(EWALLET_CODES).optional(),
      ewalletPhone: z.string().regex(/^08\d{8,11}$/).optional(),
      referenceId: z.string().max(64).optional(),
      metadata: z.record(z.unknown()).optional(),
    }).superRefine((data, ctx) => {
      if (data.disbursementType === DisbursementType.BANK_TRANSFER) {
        if (!data.bankCode) ctx.addIssue({ code: 'custom', path: ['bankCode'], message: 'Required for bank transfer' })
        if (!data.accountNumber) ctx.addIssue({ code: 'custom', path: ['accountNumber'], message: 'Required for bank transfer' })
        if (!data.accountName) ctx.addIssue({ code: 'custom', path: ['accountName'], message: 'Required for bank transfer' })
      } else {
        if (!data.ewalletCode) ctx.addIssue({ code: 'custom', path: ['ewalletCode'], message: 'Required for e-wallet' })
        if (!data.ewalletPhone) ctx.addIssue({ code: 'custom', path: ['ewalletPhone'], message: 'Required for e-wallet' })
      }
    })

    const body = bankSchema.parse(req.body)
    const result = await createOfframpOrder({
      customerId: req.customerId,
      ...body,
    } as Parameters<typeof createOfframpOrder>[0])

    return reply.code(201).send({ success: true, data: result })
  })

  // GET /v1/offramp/:orderId
  fastify.get<{ Params: { orderId: string } }>('/offramp/:orderId', async (req, reply) => {
    const order = await prisma.offrampOrder.findFirst({
      where: { id: req.params.orderId, customerId: req.customerId },
    })

    if (!order) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Order not found' },
      })
    }

    return reply.send({ success: true, data: order })
  })

  // POST /v1/offramp/verify-account — verify bank account name before off-ramp
  fastify.post('/offramp/verify-account', {
    schema: {
      tags: ['offramp'],
      summary: 'Verify bank account name via DurianPay before creating an off-ramp order',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['bankCode', 'accountNumber'],
        properties: {
          bankCode: { type: 'string', minLength: 3, maxLength: 10, description: 'Bank code (e.g. BCA, MANDIRI)' },
          accountNumber: { type: 'string', minLength: 5, maxLength: 20, description: 'Destination account number' },
        },
      },
    },
  }, async (req, reply) => {
    const schema = z.object({
      bankCode: z.string().min(3).max(10),
      accountNumber: z.string().min(5).max(20),
    })

    const body = schema.parse(req.body)
    const result = await verifyBankAccount(body)

    return reply.send({ success: true, data: result })
  })

  // POST /v1/callbacks/durianpay — DurianPay async disbursement callback (no auth)
  fastify.post('/callbacks/durianpay', async (req, reply) => {
    const signature = req.headers['x-durianpay-signature'] as string | undefined
    const body = JSON.stringify(req.body)

    if (signature && !validateDurianpayWebhook(body, signature)) {
      return reply.code(401).send({ success: false, error: { code: 'BAD_SIGNATURE', message: '' } })
    }

    const schema = z.object({
      type: z.string(),
      data: z.object({
        id: z.string(),
        status: z.string(),
      }),
    })

    const payload = schema.parse(req.body)
    if (payload.type === 'disbursement.completed') {
      await handleDisbursementCallback(payload.data.id, 'completed')
    } else if (payload.type === 'disbursement.failed') {
      await handleDisbursementCallback(payload.data.id, 'failed')
    }

    return reply.send({ success: true, data: null })
  })
}

export default offrampRoutes
