import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { quoteCorridor, createRemittanceOrder, getRemittanceOrder, confirmRemittanceReceipt } from '../../services/corridor/index.js'
import { prisma } from '../../db/client.js'

const SUPPORTED_CORRIDORS = ['MY', 'SA', 'AE', 'SG', 'US'] as const

const QuoteSchema = z.object({
  corridorCode: z.enum(SUPPORTED_CORRIDORS),
  amountSource: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount'),
})

const CreateRemittanceSchema = z.object({
  corridorCode: z.enum(SUPPORTED_CORRIDORS),
  sourceCurrency: z.string().length(3),
  amountSource: z.string().regex(/^\d+(\.\d{1,2})?$/),
  recipientName: z.string().min(2).max(100),
  recipientBank: z.string().optional(),
  recipientAccountNumber: z.string().optional(),
  recipientEwallet: z.enum(['GOPAY', 'OVO', 'DANA', 'SHOPEEPAY', 'LINKAJA']).optional(),
  recipientPhone: z.string().regex(/^08\d{8,11}$/).optional(),
}).superRefine((data, ctx) => {
  const hasBank = data.recipientBank && data.recipientAccountNumber
  const hasEwallet = data.recipientEwallet && data.recipientPhone
  if (!hasBank && !hasEwallet) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide either (recipientBank + recipientAccountNumber) or (recipientEwallet + recipientPhone)',
    })
  }
})

const SOURCE_CURRENCIES: Record<string, string> = {
  MY: 'MYR',
  SA: 'SAR',
  AE: 'AED',
  SG: 'SGD',
  US: 'USD',
}

export async function corridorRoutes(app: FastifyInstance) {
  // GET /v1/remittance/quote?corridorCode=MY&amountSource=1000
  app.get('/remittance/quote', async (request, reply) => {
    const query = QuoteSchema.parse(request.query)
    const sourceCurrency = SOURCE_CURRENCIES[query.corridorCode]

    const quote = await quoteCorridor({
      corridorCode: query.corridorCode,
      sourceCurrency,
      amountSource: query.amountSource,
    })

    return reply.send(quote)
  })

  // POST /v1/remittance
  app.post('/remittance', async (request, reply) => {
    const body = CreateRemittanceSchema.parse(request.body)

    const sourceCurrency = SOURCE_CURRENCIES[body.corridorCode]

    const order = await createRemittanceOrder({
      customerId: request.customerId,
      corridorCode: body.corridorCode,
      sourceCurrency,
      amountSource: body.amountSource,
      recipientName: body.recipientName,
      recipientBank: body.recipientBank,
      recipientAccountNumber: body.recipientAccountNumber,
      recipientEwallet: body.recipientEwallet,
      recipientPhone: body.recipientPhone,
    })

    return reply.status(201).send(order)
  })

  // GET /v1/remittance — list orders with optional status filter + cursor pagination
  app.get('/remittance', {
    schema: {
      tags: ['remittance'],
      summary: 'List remittance orders',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const schema = z.object({
      status: z.enum(['PENDING', 'FUNDED', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED']).optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    })

    const query = schema.parse(request.query)

    const orders = await prisma.remittanceOrder.findMany({
      where: {
        customerId: request.customerId,
        ...(query.status ? { status: query.status } : {}),
      },
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: query.limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        corridorCode: true,
        sourceCurrency: true,
        amountSource: true,
        quotedAmountIdr: true,
        recipientName: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    })

    const nextCursor = orders.length === query.limit ? orders[orders.length - 1].id : null

    return reply.send({ success: true, data: orders, nextCursor })
  })

  // GET /v1/remittance/:remittanceId
  app.get('/remittance/:remittanceId', async (request, reply) => {
    const { remittanceId } = request.params as { remittanceId: string }

    const order = await getRemittanceOrder(remittanceId, request.customerId)
    if (!order) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Remittance order not found' },
      })
    }

    return reply.send({ success: true, data: order })
  })

  // POST /v1/remittance/:remittanceId/confirm — partner confirms receipt of source funds
  app.post('/remittance/:remittanceId/confirm', async (request, reply) => {
    const { remittanceId } = request.params as { remittanceId: string }

    const schema = z.object({
      receivedAmountSource: z.string().regex(/^\d+(\.\d{1,2})?$/),
      externalRef: z.string().max(100).optional(),
    })

    const body = schema.parse(request.body)

    // Scope check — only allow the order's owner to confirm
    const order = await getRemittanceOrder(remittanceId, request.customerId)
    if (!order) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Remittance order not found' },
      })
    }

    await confirmRemittanceReceipt(
      remittanceId,
      body.receivedAmountSource,
      body.externalRef ?? remittanceId
    )

    const updated = await getRemittanceOrder(remittanceId, request.customerId)
    return reply.send({ success: true, data: updated })
  })
}
