-- OKR Hub fork (OKR-170): fields carried over from Capsule.
-- Additive only; safe to apply on top of upstream migrations.

-- AlterTable
ALTER TABLE "crm_Opportunities"
  ADD COLUMN IF NOT EXISTS "brand" TEXT,
  ADD COLUMN IF NOT EXISTS "service_lines" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "value_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "lost_reason" TEXT;

-- AlterTable
ALTER TABLE "crm_Accounts"
  ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX IF NOT EXISTS "crm_Opportunities_brand_idx" ON "crm_Opportunities"("brand");
