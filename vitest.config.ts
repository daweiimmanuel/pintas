import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      MASTER_API_KEY_SECRET: 'pintas-test-master-key-sprint8-32charlong!',
      WEBHOOK_SIGNING_SECRET: 'pintas-test-webhook-secret-32charlong!!',
    },
  },
})
