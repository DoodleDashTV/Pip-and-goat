-- Studio Milestone 5 — character-independent pre-production run persistence.
--
-- Purely additive. One new table; no existing table, column or constraint is
-- altered or dropped. `episode_id` is TEXT, not a UUID foreign key, matching
-- production_blueprints: planning can precede an Episode row, and proxy
-- pipeline tests use logical ids.

CREATE TABLE "preproduction_runs" (
    "id" UUID NOT NULL,
    "episode_id" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "character_mode" TEXT NOT NULL,
    "output_class" TEXT NOT NULL,
    "terminal_state" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "cache_key" TEXT NOT NULL,
    "scene_plan_emitted" BOOLEAN NOT NULL DEFAULT false,
    "paid_gpu" BOOLEAN NOT NULL DEFAULT false,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preproduction_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "preproduction_runs_episode_id_cache_key_key" ON "preproduction_runs"("episode_id", "cache_key");
CREATE INDEX "preproduction_runs_episode_id_created_at_idx" ON "preproduction_runs"("episode_id", "created_at");
