-- Cloud production engine: season queue, GPU spend, batch sessions

CREATE TABLE "season_production_queue_entries" (
    "id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "episode_number" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "draft_approved" BOOLEAN NOT NULL DEFAULT false,
    "final_approved" BOOLEAN NOT NULL DEFAULT false,
    "render_status" TEXT NOT NULL DEFAULT 'PENDING',
    "qc_status" TEXT NOT NULL DEFAULT 'PENDING',
    "cloud_cost" DOUBLE PRECISION,
    "final_output" TEXT,
    "provider" TEXT,
    "batch_session_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "season_production_queue_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "season_production_queue_entries_season_id_episode_number_key" ON "season_production_queue_entries"("season_id", "episode_number");
CREATE INDEX "season_production_queue_entries_season_id_render_status_idx" ON "season_production_queue_entries"("season_id", "render_status");
CREATE INDEX "season_production_queue_entries_episode_id_idx" ON "season_production_queue_entries"("episode_id");

CREATE TABLE "cloud_gpu_spend_entries" (
    "id" UUID NOT NULL,
    "job_id" TEXT,
    "episode_id" UUID,
    "batch_session_id" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'RUNPOD_BLENDER',
    "gpu_type" TEXT,
    "pod_id" TEXT,
    "estimated_cost_usd" DOUBLE PRECISION,
    "actual_cost_usd" DOUBLE PRECISION,
    "runtime_minutes" DOUBLE PRECISION,
    "hourly_price_usd" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'ESTIMATED',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_gpu_spend_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cloud_gpu_spend_entries_created_at_idx" ON "cloud_gpu_spend_entries"("created_at");
CREATE INDEX "cloud_gpu_spend_entries_episode_id_idx" ON "cloud_gpu_spend_entries"("episode_id");

CREATE TABLE "cloud_render_sessions" (
    "id" UUID NOT NULL,
    "batch_session_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'RUNPOD_BLENDER',
    "pod_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "gpu_type" TEXT,
    "shared_assets_loaded" BOOLEAN NOT NULL DEFAULT false,
    "episode_ids" JSONB NOT NULL,
    "completed_episode_ids" JSONB,
    "failed_episode_ids" JSONB,
    "estimated_cost_usd" DOUBLE PRECISION,
    "actual_cost_usd" DOUBLE PRECISION,
    "idle_shutdown_at" TIMESTAMP(3),
    "terminated_at" TIMESTAMP(3),
    "log" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cloud_render_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cloud_render_sessions_batch_session_id_key" ON "cloud_render_sessions"("batch_session_id");
