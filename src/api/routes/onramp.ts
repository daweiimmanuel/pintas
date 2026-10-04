import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createOnrampOrder, handleBifastPayment } from '../../services/settlement/onramp.js'
import { validateBifastCallback } from '../../services/biffast/index.js'
import { Stablecoin, Chain } from '../../types/index.js'
import { prisma } from '../../db/client.js'

const onrampRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/onramp — create on-ramp order (IDR → stablecoin)
  fastify.post('/onramp', async (req, reply) => {
    const schema = z.object({
      amountIdr: z.string().regex(/^\d+(\.\d+)?$/).refine(
        (v) => parseFloat(v) >= 10_000,
        'Minimum on-ramp is IDR 10,000'
      ),
      stablecoin: z.nativeEnum(Stablecoin).default(Stablecoin.USDT),
      chain: z.nativeEnum(Chain).default(Chain.POLYGON),
      destinationAddress: z.string().min(10),
      referenceId: z.string().max(64).optional(),
      metadata: z.record(z.unknown()).optional(),
    })

    const body = schema.parse(req.body)
    const result = await createOnrampOrder({
      customerId: req.customerId,
      ...body,
    })

    return reply.code(201).send({ success: true, data: result })
  })

  // GET /v1/onramp/:orderId
  fastify.get<{ Params: { orderId: string } }>('/onramp/:orderId', async (req, reply) => {
    const order = await prisma.onrampOrder.findFirst({
      where: { id: req.params.orderId, customerId: req.customerId },
      include: { virtualAccount: true },
    })

    if (!order) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Order not found' },
      })
    }

    return reply.send({ success: true, data: order })
  })

  // POST /v1/callbacks/biffast — BI-FAST payment notification (no auth)
  fastify.post('/callbacks/biffast', async (req, reply) => {
    const signature = req.headers['x-bca-signature'] as string | undefined
    const body = JSON.stringify(req.body)

    if (signature && !validateBifastCallback(body, signature)) {
      return reply.code(401).send({ success: false, error: { code: 'BAD_SIGNATURE', message: '' } })
    }

    const schema = z.object({
      virtualAccountNo: z.string(),
      paidAmount: z.string(),
      referenceNo: z.string(),
    })

    const payload = schema.parse(req.body)
    await handleBifastPayment(
      payload.virtualAccountNo,
      payload.paidAmount,
      payload.referenceNo
    )

    return reply.send({ success: true, data: null })
  })
}

export default onrampRoutes
