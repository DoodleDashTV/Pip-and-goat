-- TivvleJoy voice-generation metadata tables.
-- Additive only. Not written by public Preview. No remote migrate in this pass.

CREATE TABLE "tivvlejoy_voice_lines" (
    "id" TEXT NOT NULL,
    "production_id" UUID,
    "episode_id" TEXT NOT NULL,
    "scene_id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "voice_profile_version" TEXT NOT NULL,
    "dialogue_text" TEXT NOT NULL,
    "performance_direction" TEXT NOT NULL DEFAULT '',
    "pronunciation_notes" TEXT NOT NULL DEFAULT '',
    "emotion" TEXT NOT NULL DEFAULT '',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "generation_status" TEXT NOT NULL,
    "approval_status" TEXT NOT NULL,
    "audio_object_key" TEXT,
    "character_count" INTEGER NOT NULL,
    "usage_paid" BOOLEAN NOT NULL DEFAULT false,
    "provider_contacted" BOOLEAN NOT NULL DEFAULT false,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tivvlejoy_voice_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tivvlejoy_voice_lines_idempotency_key_key" ON "tivvlejoy_voice_lines"("idempotency_key");
CREATE INDEX "tivvlejoy_voice_lines_episode_id_created_at_idx" ON "tivvlejoy_voice_lines"("episode_id", "created_at");

CREATE TABLE "tivvlejoy_voice_usage_ledger" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "paid_characters_used" INTEGER NOT NULL DEFAULT 0,
    "fixture_characters_used" INTEGER NOT NULL DEFAULT 0,
    "paid_requests" INTEGER NOT NULL DEFAULT 0,
    "fixture_requests" INTEGER NOT NULL DEFAULT 0,
    "hard_stopped" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tivvlejoy_voice_usage_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tivvlejoy_voice_usage_ledger_month_key" ON "tivvlejoy_voice_usage_ledger"("month");

ALTER TABLE "tivvlejoy_voice_lines" ADD CONSTRAINT "tivvlejoy_voice_lines_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "tivvlejoy_productions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
