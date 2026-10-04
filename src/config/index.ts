import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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

  // Disbursement
  DURIANPAY_API_KEY: z.string().optional(),
  DURIANPAY_API_URL: z.string().default('https://api.durianpay.id'),
  XENDIT_SECRET_KEY: z.string().optional(),

  // KYC
  VERIHUBS_API_KEY: z.string().optional(),
  VERIHUBS_APP_ID: z.string().optional(),
  VERIHUBS_API_URL: z.string().default('https://api.verihubs.com'),

  // AML
  CHAINALYSIS_API_KEY: z.string().optional(),
  CHAINALYSIS_API_URL: z.string().default('https://api.chainalysis.com'),

  RATE_LIMIT_MAX: z.coerce.number().default(1000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
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
