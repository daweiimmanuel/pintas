import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { verifyTier1, verifyTier2, verifyTier3 } from '../../services/kyc/verihubs.js'
import { prisma } from '../../db/client.js'
import { dispatchWebhookEvent } from '../../services/webhook/delivery.js'

const kycRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/kyc/tier1 — individual identity verification (NIK + selfie)
  fastify.post('/kyc/tier1', async (req, reply) => {
    const schema = z.object({
      nik: z.string().length(16),
      fullName: z.string().min(2).max(100),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      selfieBase64: z.string().optional(),
    })

    const body = schema.parse(req.body)

    const existing = await prisma.kycRecord.findFirst({
      where: { customerId: req.customerId, tier: 'TIER1', status: 'APPROVED' },
    })

    if (existing) {
      return reply.code(409).send({
        success: false,
        error: { code: 'ALREADY_VERIFIED', message: 'Tier 1 KYC already approved' },
      })
    }

    const record = await prisma.kycRecord.create({
      data: {
        customerId: req.customerId,
        tier: 'TIER1',
        status: 'SUBMITTED',
        nik: body.nik,
        fullName: body.fullName,
        dateOfBirth: new Date(body.dateOfBirth),
      },
    })

    const result = await verifyTier1(body)

    const approved = result.status === 'approved'
    await prisma.kycRecord.update({
      where: { id: record.id },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        providerRef: result.providerRef,
        providerScore: result.score ? Math.round(result.score * 100) : undefined,
        notes: result.notes,
        reviewedAt: new Date(),
      },
    })

    if (approved) {
      await prisma.customer.update({
        where: { id: req.customerId },
        data: { kybStatus: 'APPROVED' },
      })
    }

    await dispatchWebhookEvent(
      req.customerId,
      approved ? 'kyc.approved' : 'kyc.rejected',
      { tier: 'TIER1', recordId: record.id, notes: result.notes }
    )

    return reply.send({
      success: true,
      data: {
        recordId: record.id,
        status: result.status,
        notes: result.notes,
      },
    })
  })

  // POST /v1/kyc/tier2 — business verification (NPWP + NIB)
  fastify.post('/kyc/tier2', async (req, reply) => {
    const schema = z.object({
      npwp: z.string().min(15).max(20),
      companyName: z.string().min(2).max(200),
      nibNumber: z.string().min(10).max(20),
      directorNik: z.string().length(16),
      directorName: z.string().min(2).max(100),
    })

    const body = schema.parse(req.body)

    const record = await prisma.kycRecord.create({
      data: {
        customerId: req.customerId,
        tier: 'TIER2',
        status: 'SUBMITTED',
        npwp: body.npwp,
        companyName: body.companyName,
        nibNumber: body.nibNumber,
      },
    })

    const result = await verifyTier2(body)

    const approved = result.status === 'approved'
    await prisma.kycRecord.update({
      where: { id: record.id },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        providerRef: result.providerRef,
        notes: result.notes,
        reviewedAt: new Date(),
      },
    })

    if (approved) {
      await prisma.customer.update({
        where: { id: req.customerId },
        data: { tier: 'TIER2' },
      })
    }

    await dispatchWebhookEvent(
      req.customerId,
      approved ? 'kyc.approved' : 'kyc.rejected',
      { tier: 'TIER2', recordId: record.id }
    )

    return reply.send({
      success: true,
      data: { recordId: record.id, status: result.status },
    })
  })

  // POST /v1/kyc/tier3 — institutional KYB (manual review queue)
  fastify.post('/kyc/tier3', {
    schema: {
      tags: ['kyc'],
      summary: 'Submit Tier 3 institutional KYB (manual review queue)',
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    const schema = z.object({
      companyName: z.string().min(2).max(200),
      npwp: z.string().min(15).max(20),
      uboNames: z.array(z.string().min(2)).min(1),
      financialStatementUrl: z.string().url().optional(),
      amlQuestionnaireUrl: z.string().url().optional(),
    })

    const body = schema.parse(req.body)

    const existing = await prisma.kycRecord.findFirst({
      where: { customerId: req.customerId, tier: 'TIER3', status: { in: ['PENDING', 'APPROVED'] } },
    })

    if (existing) {
      return reply.code(409).send({
        success: false,
        error: { code: 'ALREADY_SUBMITTED', message: 'Tier 3 KYC already submitted or approved' },
      })
    }

    const result = verifyTier3(body)

    const record = await prisma.kycRecord.create({
      data: {
        customerId: req.customerId,
        tier: 'TIER3',
        status: 'PENDING',
        npwp: body.npwp,
        companyName: body.companyName,
        notes: result.notes,
      },
    })

    return reply.code(202).send({
      success: true,
      data: {
        recordId: record.id,
        status: 'PENDING',
        message: 'Under review (1–2 business days)',
      },
    })
  })

  // GET /v1/kyc — get current KYC status
  fastify.get('/kyc', async (req, reply) => {
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: req.customerId },
      select: { kybStatus: true, tier: true },
    })

    const records = await prisma.kycRecord.findMany({
      where: { customerId: req.customerId },
      orderBy: { createdAt: 'desc' },
      select: { tier: true, status: true, createdAt: true, reviewedAt: true },
    })

    return reply.send({ success: true, data: { ...customer, records } })
  })
}

export default kycRoutes
