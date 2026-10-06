import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEMO_EXPORTER_ID = 'exp_demo_pt_contoh'
const DEMO_BUYER_ID = 'buy_demo_acme_sg'
const DEMO_PAYOUT_ACCOUNT_ID = 'pa_demo_contoh_usd'
const DEMO_KEY_RAW = process.env.DEMO_EXPORTER_API_KEY ?? 'pk_sandbox_demo_pt_contoh_ekspor'

async function main() {
  // Customer (FK parent for ApiKey) — id matches exporterId
  await prisma.customer.upsert({
    where: { email: 'admin@ptcontohekspor.co.id' },
    update: {},
    create: {
      id: DEMO_EXPORTER_ID,
      name: 'PT Contoh Ekspor',
      email: 'admin@ptcontohekspor.co.id',
      kybStatus: 'APPROVED',
      tier: 'TIER2',
    },
  })

  // API key (sha-256 of raw key stored, never the plaintext)
  const keyHash = crypto.createHash('sha256').update(DEMO_KEY_RAW).digest('hex')
  await prisma.apiKey.upsert({
    where: { keyHash },
    update: {},
    create: {
      keyHash,
      name: 'Sandbox demo key',
      scopes: ['*'],
      ipAllowlist: [],
      customerId: DEMO_EXPORTER_ID,
    },
  })

  // Exporter
  await prisma.exporter.upsert({
    where: { id: DEMO_EXPORTER_ID },
    update: {},
    create: {
      id: DEMO_EXPORTER_ID,
      legalName: 'PT Contoh Ekspor',
      nib: '1234567890123',
      npwp: '001234567890000',
      country: 'ID',
      segment: 'FORK_B',
      kybStatus: 'APPROVED',
      kybTier: 1,
    },
  })

  // Buyer (Singapore counterparty)
  await prisma.buyer.upsert({
    where: { id: DEMO_BUYER_ID },
    update: {},
    create: {
      id: DEMO_BUYER_ID,
      exporterId: DEMO_EXPORTER_ID,
      legalName: 'Acme Trading Pte. Ltd.',
      country: 'SG',
      email: 'finance@acmetrading.sg',
    },
  })

  // USD payout account
  await prisma.payoutAccount.upsert({
    where: { id: DEMO_PAYOUT_ACCOUNT_ID },
    update: {},
    create: {
      id: DEMO_PAYOUT_ACCOUNT_ID,
      exporterId: DEMO_EXPORTER_ID,
      type: 'OFFSHORE_USD',
      bankName: 'DBS Bank',
      accountNumberMasked: '****7890',
      accountRef: 'demo-account-ref-001',
      currency: 'USD',
      status: 'ACTIVE',
    },
  })

  console.log('✅ Demo seed complete')
  console.log(`   API key : ${DEMO_KEY_RAW}`)
  console.log(`   Exporter: ${DEMO_EXPORTER_ID}`)
  console.log(`   Buyer   : ${DEMO_BUYER_ID}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
