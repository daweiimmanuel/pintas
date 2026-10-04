-- CreateEnum
CREATE TYPE "OtcStatus" AS ENUM ('QUOTED', 'ACCEPTED', 'EXECUTING', 'SETTLED', 'EXPIRED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "OtcSide" AS ENUM ('BUY', 'SELL');

-- AlterTable (add otcOrders relation carrier — no column on Customer needed, FK is on OtcOrder)

-- CreateTable
CREATE TABLE "OtcOrder" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "side" "OtcSide" NOT NULL,
    "stablecoin" "Stablecoin" NOT NULL,
    "chain" "Chain" NOT NULL,
    "amountIdr" DECIMAL(20,2) NOT NULL,
    "amountStablecoin" DECIMAL(20,8) NOT NULL,
    "rate" DECIMAL(20,8) NOT NULL,
    "spreadBps" INTEGER NOT NULL,
    "status" "OtcStatus" NOT NULL DEFAULT 'QUOTED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "destinationAddress" TEXT,
    "bankCode" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "settlementTxHash" TEXT,
    "counterpartyRef" TEXT,
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtcOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtcOrder_customerId_status_idx" ON "OtcOrder"("customerId", "status");

-- CreateIndex
CREATE INDEX "OtcOrder_createdAt_idx" ON "OtcOrder"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "OtcOrder" ADD CONSTRAINT "OtcOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
