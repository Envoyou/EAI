-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "acquisitionSource" TEXT,
ADD COLUMN     "acquisitionSourceOther" TEXT,
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "primaryGoal" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingRole" TEXT;
