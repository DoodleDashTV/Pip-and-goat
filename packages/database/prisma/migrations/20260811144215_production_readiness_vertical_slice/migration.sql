-- CreateEnum
CREATE TYPE "ProductionReadinessState" AS ENUM ('READY', 'WARNING', 'BLOCKED', 'NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "IntakeAssetKind" AS ENUM ('CHARACTER_BLEND', 'CHARACTER_GLB', 'CHARACTER_GLTF', 'CHARACTER_FBX', 'TEXTURE', 'MATERIAL', 'RIG', 'FACIAL_SHAPEKEYS', 'REFERENCE_IMAGE', 'TURNAROUND', 'EXPRESSION_SHEET', 'POSE_REFERENCE', 'LOCATION_BLEND', 'LOCATION_PROP', 'LIGHTING_SETUP', 'OTHER');

-- CreateEnum
CREATE TYPE "PipelineStageCode" AS ENUM ('STORY_APPROVAL', 'CONTINUITY_CHECK', 'STORYBOARD', 'SHOT_PLANNING', 'ASSET_CHECK', 'VOICE_GENERATION', 'ANIMATION', 'PREFLIGHT', 'DOODLE_GUARDIAN', 'DRAFT_RENDER', 'QC', 'FINAL_RENDER', 'AUDIO_POST', 'CAPTIONS', 'PUBLISHING_PACKAGE');

-- CreateEnum
CREATE TYPE "PipelineStageStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED', 'SKIPPED');

-- CreateTable
CREATE TABLE "production_asset_intakes" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "kind" "IntakeAssetKind" NOT NULL,
    "asset_id" UUID,
    "original_filename" TEXT,
    "mime_type" TEXT,
    "storage_location" TEXT,
    "checksum" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT,
    "approval_status" TEXT NOT NULL DEFAULT 'PENDING',
    "rig_status" TEXT,
    "facial_rig_status" TEXT,
    "texture_status" TEXT,
    "production_ready" BOOLEAN NOT NULL DEFAULT false,
    "approved_by" TEXT,
    "notes" TEXT,
    "missing_reason" TEXT,
    "uploaded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_asset_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_validation_reports" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "model_id" UUID,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "blocked_final" BOOLEAN NOT NULL DEFAULT true,
    "score" INTEGER NOT NULL DEFAULT 0,
    "checks" JSONB NOT NULL,
    "missing_controls" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_validation_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approved_character_references" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "character_version_id" UUID,
    "reference_image_id" UUID,
    "role" TEXT NOT NULL DEFAULT 'PRIMARY',
    "immutable" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "palette" JSONB,
    "proportions" JSONB,
    "silhouette" TEXT,
    "clothing" TEXT,
    "accessories" TEXT,
    "forbidden_changes" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approved_character_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_production_configs" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "voice_profile_id" UUID,
    "provider" TEXT,
    "voice_id" TEXT,
    "voice_version" TEXT,
    "speed" DOUBLE PRECISION,
    "pitch" DOUBLE PRECISION,
    "stability" DOUBLE PRECISION,
    "pronunciation_dictionary" JSONB,
    "emotional_delivery" JSONB,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "audition_notes" TEXT,
    "blocked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_production_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shot_animation_packages" (
    "id" UUID NOT NULL,
    "shot_id" UUID NOT NULL,
    "episode_id" UUID,
    "package_version" INTEGER NOT NULL DEFAULT 1,
    "instructions" JSONB NOT NULL,
    "character_placements" JSONB,
    "camera" JSONB,
    "lighting" JSONB,
    "props" JSONB,
    "vfx" JSONB,
    "lip_sync_refs" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "blocked_reasons" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shot_animation_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episode_pipeline_runs" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "profile_code" TEXT NOT NULL DEFAULT 'DOODLE_DASH_SHORTS',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "current_stage" TEXT,
    "resumable" BOOLEAN NOT NULL DEFAULT true,
    "cost_estimate" DOUBLE PRECISION,
    "cost_actual" DOUBLE PRECISION,
    "duration_target_sec" INTEGER,
    "error_summary" TEXT,
    "observability" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "episode_pipeline_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episode_pipeline_stages" (
    "id" UUID NOT NULL,
    "pipeline_run_id" UUID NOT NULL,
    "stage" "PipelineStageCode" NOT NULL,
    "status" "PipelineStageStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,
    "errors" JSONB,
    "outputs" JSONB,
    "blocked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "episode_pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_readiness_snapshots" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "area" TEXT NOT NULL,
    "entity_key" TEXT NOT NULL,
    "state" "ProductionReadinessState" NOT NULL,
    "reason" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_readiness_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shorts_production_profiles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL DEFAULT 'DOODLE_DASH_SHORTS',
    "name" TEXT NOT NULL DEFAULT 'Doodle Dash Shorts',
    "width" INTEGER NOT NULL DEFAULT 1080,
    "height" INTEGER NOT NULL DEFAULT 1920,
    "aspect_ratio" TEXT NOT NULL DEFAULT '9:16',
    "fps" INTEGER NOT NULL DEFAULT 30,
    "allowed_durations" INTEGER[] DEFAULT ARRAY[15, 30, 45, 60]::INTEGER[],
    "title_safe_pct" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "caption_safe_pct" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shorts_production_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episode_pacing_reports" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "metrics" JSONB NOT NULL,
    "warnings" JSONB,
    "guidance" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "episode_pacing_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_job_observations" (
    "id" UUID NOT NULL,
    "job_id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "episode_id" UUID,
    "scene_id" UUID,
    "shot_id" UUID,
    "character_versions" JSONB,
    "asset_versions" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "cost_units" DOUBLE PRECISION,
    "warnings" JSONB,
    "errors" JSONB,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_job_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "production_asset_intakes_entity_type_entity_id_idx" ON "production_asset_intakes"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "production_asset_intakes_kind_approval_status_idx" ON "production_asset_intakes"("kind", "approval_status");

-- CreateIndex
CREATE INDEX "character_validation_reports_character_id_created_at_idx" ON "character_validation_reports"("character_id", "created_at");

-- CreateIndex
CREATE INDEX "approved_character_references_character_id_role_idx" ON "approved_character_references"("character_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "voice_production_configs_character_id_key" ON "voice_production_configs"("character_id");

-- CreateIndex
CREATE INDEX "shot_animation_packages_shot_id_idx" ON "shot_animation_packages"("shot_id");

-- CreateIndex
CREATE INDEX "episode_pipeline_runs_episode_id_created_at_idx" ON "episode_pipeline_runs"("episode_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "episode_pipeline_stages_pipeline_run_id_stage_key" ON "episode_pipeline_stages"("pipeline_run_id", "stage");

-- CreateIndex
CREATE INDEX "production_readiness_snapshots_universe_id_area_idx" ON "production_readiness_snapshots"("universe_id", "area");

-- CreateIndex
CREATE UNIQUE INDEX "shorts_production_profiles_code_key" ON "shorts_production_profiles"("code");

-- CreateIndex
CREATE INDEX "episode_pacing_reports_episode_id_idx" ON "episode_pacing_reports"("episode_id");

-- CreateIndex
CREATE INDEX "production_job_observations_job_type_job_id_idx" ON "production_job_observations"("job_type", "job_id");

-- CreateIndex
CREATE INDEX "production_job_observations_episode_id_idx" ON "production_job_observations"("episode_id");

-- AddForeignKey
ALTER TABLE "episode_pipeline_stages" ADD CONSTRAINT "episode_pipeline_stages_pipeline_run_id_fkey" FOREIGN KEY ("pipeline_run_id") REFERENCES "episode_pipeline_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
