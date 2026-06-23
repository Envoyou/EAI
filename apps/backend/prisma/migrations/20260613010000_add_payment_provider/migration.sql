ALTER TABLE "PaymentOrder"
ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'midtrans';

CREATE INDEX "PaymentOrder_provider_status_idx"
ON "PaymentOrder"("provider", "status");
