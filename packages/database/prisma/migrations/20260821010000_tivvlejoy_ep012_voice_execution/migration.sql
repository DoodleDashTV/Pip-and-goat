-- Dedicated Preview EP012 voice execution ledger. No Voice IDs, API keys, or tokens.

CREATE TABLE "tivvlejoy_ep012_voice_executions" (
    "request_id" TEXT NOT NULL,
    "segment_id" TEXT NOT NULL,
    "character" TEXT NOT NULL,
    "character_count" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "provider_attempted_at" TIMESTAMP(3),
    "audio_sha256" TEXT,
    "audio_bytes" INTEGER,
    "storage_verified" BOOLEAN NOT NULL DEFAULT false,
    "audio_object_key" TEXT,
    "receipt_object_key" TEXT,
    "receipt_ref" TEXT,
    "alignment_present" BOOLEAN NOT NULL DEFAULT false,
    "deployment_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tivvlejoy_ep012_voice_executions_pkey" PRIMARY KEY ("request_id")
);

CREATE UNIQUE INDEX "tivvlejoy_ep012_voice_executions_segment_id_key" ON "tivvlejoy_ep012_voice_executions"("segment_id");
