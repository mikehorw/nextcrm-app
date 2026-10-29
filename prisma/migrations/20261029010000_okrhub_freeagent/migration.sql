-- OKR Hub fork (OKR-174): FreeAgent revenue. Additive only.

CREATE TABLE IF NOT EXISTS "okrhub_FreeAgentConnection" (
    "id" TEXT NOT NULL DEFAULT 'freeagent',
    "access_token_enc" TEXT NOT NULL,
    "refresh_token_enc" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "connected_by" UUID,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sync_at" TIMESTAMP(3),
    "last_sync_error" TEXT,
    CONSTRAINT "okrhub_FreeAgentConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "okrhub_FreeAgentContact" (
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand_override" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "okrhub_FreeAgentContact_pkey" PRIMARY KEY ("url")
);

CREATE TABLE IF NOT EXISTS "okrhub_FreeAgentDocument" (
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "contact_url" TEXT,
    "reference" TEXT,
    "dated_on" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "net_value" DECIMAL(18,2) NOT NULL,
    "exchange_rate" DECIMAL(18,8),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "okrhub_FreeAgentDocument_pkey" PRIMARY KEY ("url")
);

CREATE INDEX IF NOT EXISTS "okrhub_FreeAgentDocument_dated_on_idx" ON "okrhub_FreeAgentDocument"("dated_on");
CREATE INDEX IF NOT EXISTS "okrhub_FreeAgentDocument_contact_url_idx" ON "okrhub_FreeAgentDocument"("contact_url");
