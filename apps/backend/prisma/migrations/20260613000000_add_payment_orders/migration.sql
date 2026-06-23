CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "planId" TEXT NOT NULL,
    "amountIdr" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "transactionId" TEXT,
    "paymentType" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentOrder_userId_status_idx" ON "PaymentOrder"("userId", "status");
CREATE INDEX "PaymentOrder_organizationId_status_idx" ON "PaymentOrder"("organizationId", "status");
CREATE INDEX "PaymentOrder_createdAt_idx" ON "PaymentOrder"("createdAt");

ALTER TABLE "PaymentOrder"
ADD CONSTRAINT "PaymentOrder_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentOrder"
ADD CONSTRAINT "PaymentOrder_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
