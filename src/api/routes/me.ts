import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/client.js'

const meRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /v1/me — authenticated customer profile
  fastify.get('/me', async (req, reply) => {
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: req.customerId },
      select: {
        id: true,
        name: true,
        email: true,
        kybStatus: true,
        tier: true,
        createdAt: true,
      },
    })

    return reply.send({ success: true, data: customer })
  })

  // PATCH /v1/me — update customer display name
  fastify.patch('/me', async (req, reply) => {
    const schema = z.object({
      name: z.string().min(2).max(100).optional(),
    })

    const body = schema.parse(req.body)

    if (!body.name) {
      return reply.send({ success: true, data: null })
    }

    const customer = await prisma.customer.update({
      where: { id: req.customerId },
      data: { name: body.name },
      select: {
        id: true,
        name: true,
        email: true,
        kybStatus: true,
        tier: true,
        updatedAt: true,
      },
    })

    return reply.send({ success: true, data: customer })
  })
}

export default meRoutes
