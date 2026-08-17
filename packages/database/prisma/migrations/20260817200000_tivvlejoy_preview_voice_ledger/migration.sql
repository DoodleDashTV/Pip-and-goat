-- Durable Preview voice ledger. No Voice IDs, API keys, or test tokens.

CREATE TABLE "tivvlejoy_preview_voice_ledger_state" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "paid_requests" INTEGER NOT NULL DEFAULT 0,
    "paid_characters_used" INTEGER NOT NULL DEFAULT 0,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "reserved_requests" INTEGER NOT NULL DEFAULT 0,
    "reserved_characters" INTEGER NOT NULL DEFAULT 0,
    "unfinalized_count" INTEGER NOT NULL DEFAULT 0,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "reconciliation_status" TEXT NOT NULL,
    "reconciliation_evidence" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tivvlejoy_preview_voice_ledger_state_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tivvlejoy_preview_voice_ledger_entries" (
    "idempotency_key" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "character" TEXT NOT NULL,
    "character_count" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "receipt_ref" TEXT,
    "deployment_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tivvlejoy_preview_voice_ledger_entries_pkey" PRIMARY KEY ("idempotency_key")
);

CREATE UNIQUE INDEX "tivvlejoy_preview_voice_ledger_entries_request_id_key" ON "tivvlejoy_preview_voice_ledger_entries"("request_id");
