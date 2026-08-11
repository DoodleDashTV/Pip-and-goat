-- CreateEnum
CREATE TYPE "AnimationCategory" AS ENUM ('LOCOMOTION', 'DIALOGUE', 'REACTION', 'INTERACTION', 'EMOTIONAL', 'IDLE');

-- CreateEnum
CREATE TYPE "ReferenceReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CONFLICTING');

-- CreateEnum
CREATE TYPE "RegistryApprovalStatus" AS ENUM ('MISSING', 'DRAFT', 'REVIEW', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "character_3d_models" ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "character_rigs" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "character_version_id" UUID,
    "rig_version" TEXT NOT NULL,
    "skeleton_type" TEXT,
    "bone_map" JSONB,
    "ik_configuration" JSONB,
    "control_rig" JSONB,
    "supports_feet" BOOLEAN NOT NULL DEFAULT true,
    "supports_hands" BOOLEAN NOT NULL DEFAULT true,
    "supports_head" BOOLEAN NOT NULL DEFAULT true,
    "supports_eyes" BOOLEAN NOT NULL DEFAULT true,
    "supports_spine" BOOLEAN NOT NULL DEFAULT true,
    "supports_ears" BOOLEAN NOT NULL DEFAULT false,
    "supports_tail" BOOLEAN NOT NULL DEFAULT false,
    "asset_id" UUID,
    "status" "RegistryApprovalStatus" NOT NULL DEFAULT 'MISSING',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_rigs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_facial_rigs" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "character_version_id" UUID,
    "rig_version" TEXT NOT NULL,
    "shape_keys" JSONB,
    "facial_bones" JSONB,
    "visemes" JSONB,
    "supported_expressions" JSONB,
    "asset_id" UUID,
    "status" "RegistryApprovalStatus" NOT NULL DEFAULT 'MISSING',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_facial_rigs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_reference_images" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "character_version_id" UUID,
    "asset_id" UUID,
    "title" TEXT NOT NULL,
    "view_type" TEXT,
    "review_status" "ReferenceReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "conflict_group" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_reference_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animation_definitions" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "AnimationCategory" NOT NULL,
    "duration_ms" INTEGER,
    "loopable" BOOLEAN NOT NULL DEFAULT false,
    "emotion" TEXT,
    "asset_id" UUID,
    "status" "RegistryApprovalStatus" NOT NULL DEFAULT 'MISSING',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animation_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animation_rig_compatibilities" (
    "id" UUID NOT NULL,
    "animation_id" UUID NOT NULL,
    "rig_id" UUID NOT NULL,
    "compatible" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "animation_rig_compatibilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pose_definitions" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "asset_id" UUID,
    "status" "RegistryApprovalStatus" NOT NULL DEFAULT 'MISSING',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pose_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expression_definitions" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "intensity" TEXT,
    "asset_id" UUID,
    "status" "RegistryApprovalStatus" NOT NULL DEFAULT 'MISSING',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expression_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "viseme_definitions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "viseme_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "character_rigs_character_id_idx" ON "character_rigs"("character_id");

-- CreateIndex
CREATE INDEX "character_facial_rigs_character_id_idx" ON "character_facial_rigs"("character_id");

-- CreateIndex
CREATE INDEX "character_reference_images_character_id_idx" ON "character_reference_images"("character_id");

-- CreateIndex
CREATE INDEX "character_reference_images_review_status_idx" ON "character_reference_images"("review_status");

-- CreateIndex
CREATE INDEX "animation_definitions_category_idx" ON "animation_definitions"("category");

-- CreateIndex
CREATE UNIQUE INDEX "animation_definitions_universe_id_code_key" ON "animation_definitions"("universe_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "animation_rig_compatibilities_animation_id_rig_id_key" ON "animation_rig_compatibilities"("animation_id", "rig_id");

-- CreateIndex
CREATE UNIQUE INDEX "pose_definitions_universe_id_code_key" ON "pose_definitions"("universe_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "expression_definitions_universe_id_code_key" ON "expression_definitions"("universe_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "viseme_definitions_code_key" ON "viseme_definitions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "studio_settings_key_key" ON "studio_settings"("key");

-- CreateIndex
CREATE INDEX "character_3d_models_status_idx" ON "character_3d_models"("status");

-- AddForeignKey
ALTER TABLE "character_3d_models" ADD CONSTRAINT "character_3d_models_rig_id_fkey" FOREIGN KEY ("rig_id") REFERENCES "character_rigs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_3d_models" ADD CONSTRAINT "character_3d_models_facial_rig_id_fkey" FOREIGN KEY ("facial_rig_id") REFERENCES "character_facial_rigs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_rigs" ADD CONSTRAINT "character_rigs_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_rigs" ADD CONSTRAINT "character_rigs_character_version_id_fkey" FOREIGN KEY ("character_version_id") REFERENCES "character_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_facial_rigs" ADD CONSTRAINT "character_facial_rigs_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_facial_rigs" ADD CONSTRAINT "character_facial_rigs_character_version_id_fkey" FOREIGN KEY ("character_version_id") REFERENCES "character_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_reference_images" ADD CONSTRAINT "character_reference_images_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_reference_images" ADD CONSTRAINT "character_reference_images_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_reference_images" ADD CONSTRAINT "character_reference_images_character_version_id_fkey" FOREIGN KEY ("character_version_id") REFERENCES "character_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animation_definitions" ADD CONSTRAINT "animation_definitions_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animation_rig_compatibilities" ADD CONSTRAINT "animation_rig_compatibilities_animation_id_fkey" FOREIGN KEY ("animation_id") REFERENCES "animation_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animation_rig_compatibilities" ADD CONSTRAINT "animation_rig_compatibilities_rig_id_fkey" FOREIGN KEY ("rig_id") REFERENCES "character_rigs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pose_definitions" ADD CONSTRAINT "pose_definitions_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expression_definitions" ADD CONSTRAINT "expression_definitions_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
