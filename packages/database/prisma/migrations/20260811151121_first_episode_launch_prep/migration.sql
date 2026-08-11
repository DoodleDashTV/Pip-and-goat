-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntakeAssetKind" ADD VALUE 'PROP_BLEND';
ALTER TYPE "IntakeAssetKind" ADD VALUE 'PROP_GLB';

-- CreateTable
CREATE TABLE "stored_production_objects" (
    "id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'local',
    "category" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "checksum" TEXT,
    "byte_size" INTEGER,
    "content_type" TEXT,
    "original_name" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_production_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_model_inspections" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "intake_id" UUID,
    "asset_version" INTEGER NOT NULL DEFAULT 1,
    "file_name" TEXT,
    "file_size" INTEGER,
    "file_hash" TEXT,
    "format" TEXT,
    "report" JSONB NOT NULL,
    "required_findings" JSONB,
    "recommended_findings" JSONB,
    "optional_findings" JSONB,
    "production_ready_eligible" BOOLEAN NOT NULL DEFAULT false,
    "blender_inspect_status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_model_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_facial_control_maps" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "asset_version" INTEGER NOT NULL DEFAULT 1,
    "intake_id" UUID,
    "control_type" TEXT NOT NULL DEFAULT 'SHAPE_KEY',
    "mappings" JSONB NOT NULL,
    "required_complete" BOOLEAN NOT NULL DEFAULT false,
    "missing_required" JSONB,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_facial_control_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approved_reference_versions" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "primary_image_id" UUID,
    "additional_image_ids" JSONB,
    "palette" JSONB,
    "silhouette_notes" TEXT,
    "proportion_notes" TEXT,
    "locked_traits" JSONB,
    "asset_version" INTEGER,
    "immutable" BOOLEAN NOT NULL DEFAULT true,
    "approvedBy" TEXT,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approved_reference_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_preview_jobs" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "pose_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "render_job_id" UUID,
    "artifact_uri" TEXT,
    "blocked_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_preview_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environment_validation_reports" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "checks" JSONB NOT NULL,
    "blockers" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environment_validation_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prop_production_profiles" (
    "id" UUID NOT NULL,
    "prop_id" UUID NOT NULL,
    "intake_id" UUID,
    "scale" DOUBLE PRECISION,
    "origin_notes" TEXT,
    "interaction_points" JSONB,
    "hand_grip_location" JSONB,
    "physics_enabled" BOOLEAN NOT NULL DEFAULT false,
    "character_compatibility" JSONB,
    "approved_asset_version" INTEGER,
    "production_ready" BOOLEAN NOT NULL DEFAULT false,
    "blocked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prop_production_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_config_versions" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "provider" TEXT,
    "voice_id" TEXT,
    "model" TEXT,
    "settings" JSONB,
    "audition_uri" TEXT,
    "audition_script" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_config_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blender_worker_self_tests" (
    "id" UUID NOT NULL,
    "worker_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "blender_bin" TEXT,
    "blender_version" TEXT,
    "artifact_uri" TEXT,
    "storage_key" TEXT,
    "log_excerpt" TEXT,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blender_worker_self_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episode_checklist_items" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "state" "ProductionReadinessState" NOT NULL,
    "reason" TEXT NOT NULL,
    "fix_href" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "episode_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_reviews" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "pipeline_run_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "draft_uri" TEXT,
    "guardian_score" DOUBLE PRECISION,
    "qc_score" DOUBLE PRECISION,
    "warnings" JSONB,
    "versions_used" JSONB,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draft_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_review_notes" (
    "id" UUID NOT NULL,
    "draft_review_id" UUID NOT NULL,
    "shot_id" UUID,
    "note" TEXT NOT NULL,
    "createdBy" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_review_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_manifests" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DRAFT',
    "locked" BOOLEAN NOT NULL DEFAULT true,
    "manifest" JSONB NOT NULL,
    "storage_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dialogue_voice_version_links" (
    "id" UUID NOT NULL,
    "dialogue_line_id" UUID NOT NULL,
    "voice_config_version_id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dialogue_voice_version_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episode_reference_version_links" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "approved_reference_version_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "episode_reference_version_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stored_production_objects_storage_key_key" ON "stored_production_objects"("storage_key");

-- CreateIndex
CREATE INDEX "stored_production_objects_category_idx" ON "stored_production_objects"("category");

-- CreateIndex
CREATE INDEX "character_model_inspections_character_id_created_at_idx" ON "character_model_inspections"("character_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "character_facial_control_maps_character_id_asset_version_key" ON "character_facial_control_maps"("character_id", "asset_version");

-- CreateIndex
CREATE INDEX "approved_reference_versions_character_id_idx" ON "approved_reference_versions"("character_id");

-- CreateIndex
CREATE UNIQUE INDEX "approved_reference_versions_character_id_version_number_key" ON "approved_reference_versions"("character_id", "version_number");

-- CreateIndex
CREATE INDEX "character_preview_jobs_character_id_pose_code_idx" ON "character_preview_jobs"("character_id", "pose_code");

-- CreateIndex
CREATE INDEX "environment_validation_reports_location_id_created_at_idx" ON "environment_validation_reports"("location_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "prop_production_profiles_prop_id_key" ON "prop_production_profiles"("prop_id");

-- CreateIndex
CREATE INDEX "voice_config_versions_character_id_status_idx" ON "voice_config_versions"("character_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "voice_config_versions_character_id_version_number_key" ON "voice_config_versions"("character_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "episode_checklist_items_episode_id_category_key" ON "episode_checklist_items"("episode_id", "category");

-- CreateIndex
CREATE INDEX "draft_reviews_episode_id_idx" ON "draft_reviews"("episode_id");

-- CreateIndex
CREATE INDEX "production_manifests_episode_id_kind_idx" ON "production_manifests"("episode_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "dialogue_voice_version_links_dialogue_line_id_key" ON "dialogue_voice_version_links"("dialogue_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "episode_reference_version_links_episode_id_character_id_key" ON "episode_reference_version_links"("episode_id", "character_id");

-- AddForeignKey
ALTER TABLE "draft_review_notes" ADD CONSTRAINT "draft_review_notes_draft_review_id_fkey" FOREIGN KEY ("draft_review_id") REFERENCES "draft_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
