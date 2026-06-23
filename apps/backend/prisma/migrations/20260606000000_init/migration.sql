-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('success', 'error');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "imageUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisLog" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "promptVersion" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "score" INTEGER,
    "verdict" TEXT,
    "summary" TEXT,
    "feedback" JSONB,
    "flags" JSONB,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'success',
    "editorStatus" TEXT NOT NULL DEFAULT 'draft',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "AnalysisLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AnalysisLog_createdAt_idx" ON "AnalysisLog"("createdAt");

-- CreateIndex
CREATE INDEX "AnalysisLog_role_idx" ON "AnalysisLog"("role");

-- CreateIndex
CREATE INDEX "AnalysisLog_status_idx" ON "AnalysisLog"("status");

-- CreateIndex
CREATE INDEX "AnalysisLog_userId_idx" ON "AnalysisLog"("userId");

-- AddForeignKey
ALTER TABLE "AnalysisLog" ADD CONSTRAINT "AnalysisLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
