import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/client.js'
import { Chain, Stablecoin } from '../../types/index.js'

const ADDRESS_PATTERNS: Partial<Record<Chain, RegExp>> = {
  [Chain.POLYGON]: /^0x[0-9a-fA-F]{40}$/,
  [Chain.ETHEREUM]: /^0x[0-9a-fA-F]{40}$/,
  [Chain.TRON]: /^T[0-9a-zA-Z]{33}$/,
  [Chain.STELLAR]: /^G[A-Z2-7]{55}$/,
}

function validateAddress(chain: Chain, address: string): boolean {
  const pattern = ADDRESS_PATTERNS[chain]
  return pattern ? pattern.test(address) : true
}

const walletsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/wallets — register a settlement wallet
  fastify.post('/wallets', {
    schema: {
      tags: ['wallets'],
      summary: 'Register a settlement wallet address',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['chain', 'stablecoin', 'address'],
        properties: {
          chain: { type: 'string', enum: ['POLYGON', 'TRON', 'STELLAR', 'ETHEREUM'] },
          stablecoin: { type: 'string', enum: ['USDT', 'USDC'] },
          address: { type: 'string', minLength: 10, maxLength: 100, description: 'On-chain wallet address' },
          label: { type: 'string', maxLength: 64 },
        },
      },
    },
  }, async (req, reply) => {
    const schema = z.object({
      chain: z.nativeEnum(Chain),
      stablecoin: z.nativeEnum(Stablecoin),
      address: z.string().min(10).max(100),
      label: z.string().max(64).optional(),
    })

    const body = schema.parse(req.body)

    if (!validateAddress(body.chain, body.address)) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'INVALID_ADDRESS',
          message: `Address format is invalid for chain ${body.chain}`,
        },
      })
    }

    try {
      const wallet = await prisma.wallet.create({
        data: {
          customerId: req.customerId,
          chain: body.chain,
          stablecoin: body.stablecoin,
          address: body.address,
          label: body.label ?? null,
        },
      })
      return reply.code(201).send({ success: true, data: wallet })
    } catch (err: unknown) {
      const isUniqueViolation =
        err instanceof Error && err.message.includes('Unique constraint')
      if (isUniqueViolation) {
        return reply.code(409).send({
          success: false,
          error: {
            code: 'ALREADY_EXISTS',
            message: `A ${body.stablecoin} wallet on ${body.chain} is already registered`,
          },
        })
      }
      throw err
    }
  })

  // GET /v1/wallets — list registered wallets
  fastify.get('/wallets', async (req, reply) => {
    const wallets = await prisma.wallet.findMany({
      where: { customerId: req.customerId },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send({ success: true, data: wallets })
  })

  // DELETE /v1/wallets/:id — remove a wallet
  fastify.delete<{ Params: { id: string } }>('/wallets/:id', async (req, reply) => {
    const wallet = await prisma.wallet.findFirst({
      where: { id: req.params.id, customerId: req.customerId },
    })

    if (!wallet) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Wallet not found' },
      })
    }

    await prisma.wallet.delete({ where: { id: req.params.id } })
    return reply.send({ success: true, data: null })
  })
}

export default walletsRoutes
