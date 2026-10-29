-- OKR Hub fork (OKR-174): amount still owed per FreeAgent invoice. Additive only.
ALTER TABLE "okrhub_FreeAgentDocument" ADD COLUMN IF NOT EXISTS "due_value" DECIMAL(18,2);
ALTER TABLE "okrhub_FreeAgentDocument" ADD COLUMN IF NOT EXISTS "due_on" DATE;
