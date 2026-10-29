-- OKR Hub fork (OKR-175): link a FreeAgent client to a CRM account by hand. Additive only.
ALTER TABLE "okrhub_FreeAgentContact" ADD COLUMN IF NOT EXISTS "account_override" UUID;
