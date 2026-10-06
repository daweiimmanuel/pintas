-- AlterTable: add remittanceOrderId and otcOrderId FKs to WebhookDelivery
ALTER TABLE "WebhookDelivery" ADD COLUMN "remittanceOrderId" TEXT;
ALTER TABLE "WebhookDelivery" ADD COLUMN "otcOrderId" TEXT;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_remittanceOrderId_fkey"
  FOREIGN KEY ("remittanceOrderId") REFERENCES "RemittanceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_otcOrderId_fkey"
  FOREIGN KEY ("otcOrderId") REFERENCES "OtcOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
