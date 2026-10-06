import { prisma } from '../../db/client.js'
import type { ExporterKybStatus } from '@prisma/client'

export interface CreateExporterInput {
  legalName: string
  nib: string
  npwp: string
  country?: string
}

export interface CreatePayoutAccountInput {
  exporterId: string
  type: 'OFFSHORE_USD' | 'ID_BANK_USD'
  bankName: string
  accountNumber: string  // raw; stored masked
  accountRef: string
  currency?: string
}

function maskAccount(raw: string): string {
  if (raw.length <= 4) return '****'
  return '*'.repeat(raw.length - 4) + raw.slice(-4)
}

export async function createExporter(input: CreateExporterInput) {
  return prisma.exporter.create({
    data: {
      legalName: input.legalName,
      nib: input.nib,
      npwp: input.npwp,
      country: input.country ?? 'ID',
    },
  })
}

export async function approveKyb(exporterId: string): Promise<void> {
  await prisma.exporter.update({
    where: { id: exporterId },
    data: { kybStatus: 'APPROVED' as ExporterKybStatus, kybTier: 1 },
  })
}

export async function getExporter(exporterId: string) {
  return prisma.exporter.findUnique({ where: { id: exporterId } })
}

export async function createPayoutAccount(input: CreatePayoutAccountInput) {
  const masked = maskAccount(input.accountNumber)
  return prisma.payoutAccount.create({
    data: {
      exporterId: input.exporterId,
      type: input.type,
      bankName: input.bankName,
      accountNumberMasked: masked,
      accountRef: input.accountRef,
      currency: input.currency ?? 'USD',
    },
    select: {
      id: true,
      exporterId: true,
      type: true,
      bankName: true,
      accountNumberMasked: true,
      currency: true,
      status: true,
      createdAt: true,
    },
  })
}

export async function listPayoutAccounts(exporterId: string) {
  return prisma.payoutAccount.findMany({
    where: { exporterId, status: 'ACTIVE' },
    select: {
      id: true,
      type: true,
      bankName: true,
      accountNumberMasked: true,
      currency: true,
      status: true,
      createdAt: true,
    },
  })
}
