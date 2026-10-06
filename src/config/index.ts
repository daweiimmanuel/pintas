import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['development', 'sandbox', 'production']).default('development'),
  PROVIDER_MODE: z.enum(['mock', 'live', 'durianpay']).default('mock'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  API_BASE_URL: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  MASTER_API_KEY_SECRET: z.string().min(32),
  WEBHOOK_SIGNING_SECRET: z.string().min(32),

  // Polygon
  POLYGON_RPC_URL: z.string().default('https://polygon-rpc.com'),
  POLYGON_WALLET_PRIVATE_KEY: z.string().optional(),
  POLYGON_USDT_CONTRACT: z.string().default('0xc2132D05D31c914a87C6611C10748AEb04B58e8F'),
  POLYGON_USDC_CONTRACT: z.string().default('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'),

  // TRON
  TRON_API_URL: z.string().default('https://api.trongrid.io'),
  TRON_API_KEY: z.string().optional(),
  TRON_WALLET_ADDRESS: z.string().optional(),
  TRON_WALLET_PRIVATE_KEY: z.string().optional(),
  TRON_USDT_CONTRACT: z.string().default('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'),

  // Stellar
  STELLAR_HORIZON_URL: z.string().default('https://horizon.stellar.org'),
  STELLAR_NETWORK: z.enum(['public', 'testnet']).default('testnet'),
  STELLAR_WALLET_SECRET: z.string().optional(),

  // Exchange partners
  INDODAX_API_KEY: z.string().optional(),
  INDODAX_API_SECRET: z.string().optional(),
  TOKOCRYPTO_API_KEY: z.string().optional(),
  TOKOCRYPTO_API_SECRET: z.string().optional(),

  // BI-FAST / BCA
  BCA_APP_ID: z.string().optional(),
  BCA_API_SECRET: z.string().optional(),
  BCA_CORP_ID: z.string().optional(),
  BCA_BIFFAST_URL: z.string().default('https://sandbox.bca.co.id'),

  // Disbursement — DurianPay SNAP BI
  DURIANPAY_API_KEY: z.string().optional(),       // Client secret — HMAC-SHA512 signing key
  DURIANPAY_CLIENT_KEY: z.string().optional(),    // X-CLIENT-KEY / Merchant Client ID
  DURIANPAY_PARTNER_ID: z.string().optional(),    // X-PARTNER-ID assigned by DurianPay
  DURIANPAY_CHANNEL_ID: z.string().default('95221'), // CHANNEL-ID (DurianPay default channel)
  DURIANPAY_API_URL: z.string().default('https://api.durianpay.id'),
  DURIANPAY_PRIVATE_KEY: z.string().optional(),   // RSA private key PEM for B2B token signing
  DURIANPAY_SOURCE_ACCOUNT_NO: z.string().optional(), // Merchant account ID (sourceAccountNo)
  // Originator info — mandatory on every transfer from 14 Sep 2026 (PPATK)
  DURIANPAY_ORIGINATOR_NAME: z.string().optional(),
  DURIANPAY_ORIGINATOR_IDENTITY_TYPE: z.enum(['national_id', 'passport', 'company_id']).optional(),
  DURIANPAY_ORIGINATOR_IDENTITY_NO: z.string().optional(),
  DURIANPAY_ORIGINATOR_COUNTRY: z.string().default('ID'),
  XENDIT_SECRET_KEY: z.string().optional(),

  // KYC
  VERIHUBS_API_KEY: z.string().optional(),
  VERIHUBS_APP_ID: z.string().optional(),
  VERIHUBS_API_URL: z.string().default('https://api.verihubs.com'),

  // FX Provider
  OPEN_EXCHANGE_RATES_API_KEY: z.string().optional(),

  // Settlement addresses (custody wallets that receive inbound stablecoin deposits)
  POLYGON_USDT_SETTLEMENT_ADDRESS: z.string().optional(),
  POLYGON_USDC_SETTLEMENT_ADDRESS: z.string().optional(),
  TRON_USDT_SETTLEMENT_ADDRESS: z.string().optional(),
  STELLAR_USDT_SETTLEMENT_ADDRESS: z.string().optional(),
  STELLAR_USDC_SETTLEMENT_ADDRESS: z.string().optional(),
  ETHEREUM_USDT_SETTLEMENT_ADDRESS: z.string().optional(),

  // AML
  CHAINALYSIS_API_KEY: z.string().optional(),
  CHAINALYSIS_API_URL: z.string().default('https://api.chainalysis.com'),

  // Travel Rule (Notabene / IVMS 101) — SEOJK 20/2024 requirement for transfers > IDR 46M
  NOTABENE_API_KEY: z.string().optional(),
  NOTABENE_API_URL: z.string().default('https://api.notabene.id'),

  RATE_LIMIT_MAX: z.coerce.number().default(1000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),

  // M10 — sandbox demo dashboard
  DEMO_EXPORTER_API_KEY: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1)
  }
}

export const config = parsed.data ?? ({} as z.infer<typeof envSchema>)
export type Config = typeof config
