-- OKR Hub fork (OKR-171): won/lost dates and revenue goals.
-- Additive only; safe to apply on top of upstream migrations.

-- AlterTable
ALTER TABLE "crm_Opportunities"
  ADD COLUMN IF NOT EXISTS "won_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lost_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "crm_Opportunities_won_at_idx" ON "crm_Opportunities"("won_at");

-- CreateTable
CREATE TABLE IF NOT EXISTS "crm_Goals" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'GBP',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "brand" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "crm_Goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "crm_Goals_start_date_end_date_idx" ON "crm_Goals"("start_date", "end_date");
