-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'FUNDED', 'CONVERTING', 'DISBURSING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "Chain" AS ENUM ('POLYGON', 'TRON', 'STELLAR', 'ETHEREUM');

-- CreateEnum
CREATE TYPE "Stablecoin" AS ENUM ('USDT', 'USDC');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KycTier" AS ENUM ('TIER1', 'TIER2', 'TIER3');

-- CreateEnum
CREATE TYPE "DisbursementType" AS ENUM ('BANK_TRANSFER', 'EWALLET');

-- CreateEnum
CREATE TYPE "RemittanceStatus" AS ENUM ('PENDING', 'FUNDED', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopes" TEXT[],
    "ipAllowlist" TEXT[],
    "customerId" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "kybStatus" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "tier" "KycTier" NOT NULL DEFAULT 'TIER1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "chain" "Chain" NOT NULL,
    "address" TEXT NOT NULL,
    "stablecoin" "Stablecoin" NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "bid" DECIMAL(20,8) NOT NULL,
    "ask" DECIMAL(20,8) NOT NULL,
    "mid" DECIMAL(20,8) NOT NULL,
    "venue" TEXT NOT NULL,
    "volume24h" DECIMAL(20,8),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirtualAccount" (
    "id" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "vaNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VirtualAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnrampOrder" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountIdr" DECIMAL(20,2) NOT NULL,
    "stablecoin" "Stablecoin" NOT NULL,
    "chain" "Chain" NOT NULL,
    "quotedRate" DECIMAL(20,8) NOT NULL,
    "quotedAmount" DECIMAL(20,8) NOT NULL,
    "spreadBps" INTEGER NOT NULL,
    "quoteExpiresAt" TIMESTAMP(3) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "destinationAddress" TEXT NOT NULL,
    "actualRate" DECIMAL(20,8),
    "actualAmount" DECIMAL(20,8),
    "onchainTxHash" TEXT,
    "onchainBlock" INTEGER,
    "referenceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failReason" TEXT,
    CONSTRAINT "OnrampOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfframpOrder" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountStablecoin" DECIMAL(20,8) NOT NULL,
    "stablecoin" "Stablecoin" NOT NULL,
    "chain" "Chain" NOT NULL,
    "quotedRate" DECIMAL(20,8) NOT NULL,
    "quotedAmountIdr" DECIMAL(20,2) NOT NULL,
    "spreadBps" INTEGER NOT NULL,
    "quoteExpiresAt" TIMESTAMP(3) NOT NULL,
    "disbursementType" "DisbursementType" NOT NULL,
    "bankCode" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "ewalletCode" TEXT,
    "ewalletPhone" TEXT,
    "depositAddress" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "receivedTxHash" TEXT,
    "receivedAmount" DECIMAL(20,8),
    "actualRate" DECIMAL(20,8),
    "actualAmountIdr" DECIMAL(20,2),
    "disbursementId" TEXT,
    "disbursementRef" TEXT,
    "referenceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failReason" TEXT,
    CONSTRAINT "OfframpOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycRecord" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tier" "KycTier" NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "nik" TEXT,
    "fullName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "selfieUrl" TEXT,
    "npwp" TEXT,
    "companyName" TEXT,
    "nibNumber" TEXT,
    "providerRef" TEXT,
    "providerScore" INTEGER,
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KycRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "onrampOrderId" TEXT,
    "offrampOrderId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "succeededAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastStatusCode" INTEGER,
    "lastResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemittanceOrder" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "corridorCode" TEXT NOT NULL,
    "sourceCurrency" TEXT NOT NULL,
    "amountSource" TEXT NOT NULL,
    "feeSource" TEXT NOT NULL,
    "netAmountSource" TEXT NOT NULL,
    "fxRate" TEXT NOT NULL,
    "spreadBps" INTEGER NOT NULL,
    "quotedAmountIdr" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientBank" TEXT,
    "recipientAccountNumber" TEXT,
    "recipientEwallet" TEXT,
    "recipientPhone" TEXT,
    "offrampOrderId" TEXT,
    "status" "RemittanceStatus" NOT NULL DEFAULT 'PENDING',
    "externalRef" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RemittanceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");
CREATE UNIQUE INDEX "Wallet_customerId_chain_stablecoin_key" ON "Wallet"("customerId", "chain", "stablecoin");
CREATE UNIQUE INDEX "VirtualAccount_vaNumber_key" ON "VirtualAccount"("vaNumber");
CREATE UNIQUE INDEX "VirtualAccount_orderId_key" ON "VirtualAccount"("orderId");
CREATE UNIQUE INDEX "RemittanceOrder_offrampOrderId_key" ON "RemittanceOrder"("offrampOrderId");
CREATE INDEX "ExchangeRate_pair_venue_fetchedAt_idx" ON "ExchangeRate"("pair", "venue", "fetchedAt" DESC);
CREATE INDEX "OnrampOrder_customerId_status_idx" ON "OnrampOrder"("customerId", "status");
CREATE INDEX "OnrampOrder_createdAt_idx" ON "OnrampOrder"("createdAt" DESC);
CREATE INDEX "OfframpOrder_customerId_status_idx" ON "OfframpOrder"("customerId", "status");
CREATE INDEX "OfframpOrder_depositAddress_idx" ON "OfframpOrder"("depositAddress");
CREATE INDEX "OfframpOrder_createdAt_idx" ON "OfframpOrder"("createdAt" DESC);
CREATE INDEX "WebhookDelivery_webhookId_succeededAt_idx" ON "WebhookDelivery"("webhookId", "succeededAt");
CREATE INDEX "WebhookDelivery_nextAttemptAt_idx" ON "WebhookDelivery"("nextAttemptAt");
CREATE INDEX "RemittanceOrder_customerId_status_idx" ON "RemittanceOrder"("customerId", "status");
CREATE INDEX "RemittanceOrder_createdAt_idx" ON "RemittanceOrder"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VirtualAccount" ADD CONSTRAINT "VirtualAccount_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OnrampOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OnrampOrder" ADD CONSTRAINT "OnrampOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfframpOrder" ADD CONSTRAINT "OfframpOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_onrampOrderId_fkey" FOREIGN KEY ("onrampOrderId") REFERENCES "OnrampOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_offrampOrderId_fkey" FOREIGN KEY ("offrampOrderId") REFERENCES "OfframpOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RemittanceOrder" ADD CONSTRAINT "RemittanceOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
