import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/client.js'
import { dispatchWebhookEvent } from '../../services/webhook/delivery.js'

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // All admin routes require admin:write scope
  fastify.addHook('onRequest', fastify.requireScope('admin:write'))

  // PATCH /v1/admin/kyc/:recordId/review — approve or reject a Tier 3 KYC submission
  fastify.patch<{ Params: { recordId: string } }>('/admin/kyc/:recordId/review', {
    schema: {
      tags: ['admin'],
      summary: 'Approve or reject a Tier 3 KYC submission',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['decision'],
        properties: {
          decision: { type: 'string', enum: ['APPROVED', 'REJECTED'] },
          notes: { type: 'string', maxLength: 1000 },
        },
      },
    },
  }, async (req, reply) => {
    const schema = z.object({
      decision: z.enum(['APPROVED', 'REJECTED']),
      notes: z.string().max(1000).optional(),
    })

    const body = schema.parse(req.body)

    const record = await prisma.kycRecord.findUnique({
      where: { id: req.params.recordId },
    })

    if (!record) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'KYC record not found' },
      })
    }

    if (record.tier !== 'TIER3') {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_TIER', message: 'Only Tier 3 records can be reviewed via this endpoint' },
      })
    }

    if (record.status !== 'PENDING') {
      return reply.code(409).send({
        success: false,
        error: { code: 'ALREADY_REVIEWED', message: `Record is already ${record.status}` },
      })
    }

    const updated = await prisma.kycRecord.update({
      where: { id: record.id },
      data: {
        status: body.decision,
        notes: body.notes ?? record.notes,
        reviewedAt: new Date(),
      },
    })

    if (body.decision === 'APPROVED') {
      await prisma.customer.update({
        where: { id: record.customerId },
        data: { tier: 'TIER3' },
      })
    }

    await dispatchWebhookEvent(
      record.customerId,
      body.decision === 'APPROVED' ? 'kyc.approved' : 'kyc.rejected',
      { tier: 'TIER3', recordId: record.id, notes: updated.notes }
    )

    return reply.send({
      success: true,
      data: {
        recordId: updated.id,
        status: updated.status,
        reviewedAt: updated.reviewedAt,
      },
    })
  })

  // GET /v1/admin/kyc/pending — list pending Tier 3 submissions for review queue
  fastify.get('/admin/kyc/pending', {
    schema: {
      tags: ['admin'],
      summary: 'List pending Tier 3 KYC submissions',
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    const records = await prisma.kycRecord.findMany({
      where: { tier: 'TIER3', status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        customerId: true,
        companyName: true,
        npwp: true,
        notes: true,
        createdAt: true,
      },
    })

    return reply.send({ success: true, data: records })
  })
}

export default adminRoutes
