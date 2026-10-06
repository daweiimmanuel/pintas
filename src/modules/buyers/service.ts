import { prisma } from '../../db/client.js'

export interface CreateBuyerInput {
  exporterId: string
  legalName: string
  country: string
  email: string
}

export async function createBuyer(input: CreateBuyerInput) {
  return prisma.buyer.create({ data: input })
}

export async function listBuyers(exporterId: string) {
  return prisma.buyer.findMany({ where: { exporterId }, orderBy: { createdAt: 'desc' } })
}

export async function getBuyer(id: string) {
  return prisma.buyer.findUnique({ where: { id } })
}
