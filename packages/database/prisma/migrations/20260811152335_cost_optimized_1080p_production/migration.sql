-- CreateTable
CREATE TABLE "production_render_profiles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "aspect_ratio" TEXT NOT NULL DEFAULT '9:16',
    "fps" INTEGER NOT NULL DEFAULT 30,
    "engine" TEXT NOT NULL DEFAULT 'EEVEE',
    "quality_preset" JSONB,
    "purpose" TEXT,
    "is_default_final" BOOLEAN NOT NULL DEFAULT false,
    "is_default_draft" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_render_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shot_render_cache_entries" (
    "id" UUID NOT NULL,
    "shot_id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "profile_code" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "render_job_id" UUID,
    "output_uri" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shot_render_cache_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_generation_cache_entries" (
    "id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "character_id" UUID NOT NULL,
    "voice_version_id" UUID,
    "text" TEXT NOT NULL,
    "provider" TEXT,
    "settings" JSONB,
    "audio_uri" TEXT,
    "hit_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_generation_cache_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paid_generation_approvals" (
    "id" UUID NOT NULL,
    "episode_id" UUID,
    "shot_id" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "estimated_cost" DOUBLE PRECISION,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paid_generation_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_usage_events" (
    "id" UUID NOT NULL,
    "asset_type" TEXT NOT NULL,
    "asset_key" TEXT NOT NULL,
    "episode_id" UUID,
    "shot_id" UUID,
    "usage_count" INTEGER NOT NULL DEFAULT 1,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motion_compositions" (
    "id" UUID NOT NULL,
    "shot_id" UUID,
    "episode_id" UUID,
    "layers" JSONB NOT NULL,
    "decision_path" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "motion_compositions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animation_library_meta" (
    "id" UUID NOT NULL,
    "animation_definition_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "character_compatibility" JSONB,
    "rig_compatibility" JSONB,
    "root_motion" BOOLEAN NOT NULL DEFAULT false,
    "facial_component" BOOLEAN NOT NULL DEFAULT false,
    "tags" JSONB,
    "quality_status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "source" TEXT,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "loopable_override" BOOLEAN,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animation_library_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "render_cost_estimates" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "profile_code" TEXT NOT NULL,
    "frame_count" INTEGER NOT NULL,
    "estimated_render_minutes" DOUBLE PRECISION NOT NULL,
    "estimated_local_compute_units" DOUBLE PRECISION,
    "estimated_external_api_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shots_to_rerender" JSONB,
    "shots_cache_reusable" JSONB,
    "assumptions" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "render_cost_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "framing_validation_reports" (
    "id" UUID NOT NULL,
    "shot_id" UUID NOT NULL,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "warnings" JSONB NOT NULL,
    "checks" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "framing_validation_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "production_render_profiles_code_key" ON "production_render_profiles"("code");

-- CreateIndex
CREATE INDEX "shot_render_cache_entries_shot_id_idx" ON "shot_render_cache_entries"("shot_id");

-- CreateIndex
CREATE UNIQUE INDEX "shot_render_cache_entries_shot_id_fingerprint_profile_code_key" ON "shot_render_cache_entries"("shot_id", "fingerprint", "profile_code");

-- CreateIndex
CREATE UNIQUE INDEX "voice_generation_cache_entries_fingerprint_key" ON "voice_generation_cache_entries"("fingerprint");

-- CreateIndex
CREATE INDEX "voice_generation_cache_entries_character_id_idx" ON "voice_generation_cache_entries"("character_id");

-- CreateIndex
CREATE INDEX "paid_generation_approvals_status_idx" ON "paid_generation_approvals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "asset_usage_events_asset_type_asset_key_key" ON "asset_usage_events"("asset_type", "asset_key");

-- CreateIndex
CREATE INDEX "motion_compositions_shot_id_idx" ON "motion_compositions"("shot_id");

-- CreateIndex
CREATE UNIQUE INDEX "animation_library_meta_animation_definition_id_key" ON "animation_library_meta"("animation_definition_id");

-- CreateIndex
CREATE INDEX "render_cost_estimates_episode_id_created_at_idx" ON "render_cost_estimates"("episode_id", "created_at");

-- CreateIndex
CREATE INDEX "framing_validation_reports_shot_id_idx" ON "framing_validation_reports"("shot_id");
