-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "balanceIdr" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PaymentOrder" ADD COLUMN     "balanceRemaining" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountIdr" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "useAccountBalance" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "balanceIdr" INTEGER NOT NULL DEFAULT 0;
