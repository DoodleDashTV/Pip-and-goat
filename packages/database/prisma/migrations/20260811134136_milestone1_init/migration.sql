-- CreateEnum
CREATE TYPE "UniverseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CanonLevel" AS ENUM ('IMMUTABLE', 'CURRENT', 'HISTORICAL');

-- CreateEnum
CREATE TYPE "CanonSubjectType" AS ENUM ('UNIVERSE', 'CHARACTER', 'LOCATION', 'PROP', 'EPISODE', 'SEASON', 'GENERAL');

-- CreateEnum
CREATE TYPE "CharacterStatus" AS ENUM ('PROPOSED', 'DESIGN', 'ACTIVE', 'RETIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CharacterModelStatus" AS ENUM ('MISSING', 'MODELING', 'TEXTURING', 'RIGGING', 'FACIAL_RIGGING', 'REVIEW', 'APPROVED', 'PRODUCTION_READY');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('CHARACTER_MODEL', 'RIG', 'FACIAL_RIG', 'ANIMATION', 'POSE', 'EXPRESSION', 'LOCATION', 'PROP', 'MATERIAL', 'TEXTURE', 'LIGHTING_RIG', 'CAMERA', 'VFX', 'AUDIO', 'MUSIC', 'SFX', 'STORYBOARD', 'VIDEO', 'FINAL_EPISODE', 'THUMBNAIL', 'REFERENCE_IMAGE', 'OTHER');

-- CreateTable
CREATE TABLE "universes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "brand_name" TEXT NOT NULL,
    "description" TEXT,
    "target_audience" TEXT,
    "world_description" TEXT,
    "visual_style_id" UUID,
    "default_output_format" TEXT NOT NULL DEFAULT '1080x1920',
    "status" "UniverseStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "universes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canon_facts" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "subject_type" "CanonSubjectType" NOT NULL,
    "subject_id" UUID,
    "category" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "canon_level" "CanonLevel" NOT NULL DEFAULT 'CURRENT',
    "importance" INTEGER NOT NULL DEFAULT 50,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "introduced_episode_id" UUID,
    "effective_episode_id" UUID,
    "retired_episode_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canon_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "internal_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nickname" TEXT,
    "species" TEXT,
    "role" TEXT,
    "age_range" TEXT,
    "biography" TEXT,
    "personality" TEXT,
    "strengths" TEXT,
    "weaknesses" TEXT,
    "fears" TEXT,
    "motivations" TEXT,
    "goals" TEXT,
    "habits" TEXT,
    "likes" TEXT,
    "dislikes" TEXT,
    "catchphrases" TEXT,
    "speech_style" TEXT,
    "comedy_style" TEXT,
    "movement_style" TEXT,
    "founding_character" BOOLEAN NOT NULL DEFAULT false,
    "status" "CharacterStatus" NOT NULL DEFAULT 'ACTIVE',
    "first_episode_id" UUID,
    "current_version_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_versions" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "version_name" TEXT NOT NULL,
    "change_summary" TEXT,
    "active_from_episode_id" UUID,
    "active_until_episode_id" UUID,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_visual_dna" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "body_proportions" TEXT,
    "head_ratio" TEXT,
    "face_shape" TEXT,
    "eye_design" TEXT,
    "body_coloration" TEXT,
    "fur_feather_details" TEXT,
    "clothing" TEXT,
    "accessories" TEXT,
    "silhouette" TEXT,
    "palette" TEXT,
    "materials" TEXT,
    "textures" TEXT,
    "visual_restrictions" TEXT,
    "pending_review" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_visual_dna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_personality_dna" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "friendliness" INTEGER NOT NULL DEFAULT 50,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "bravery" INTEGER NOT NULL DEFAULT 50,
    "curiosity" INTEGER NOT NULL DEFAULT 50,
    "patience" INTEGER NOT NULL DEFAULT 50,
    "energy" INTEGER NOT NULL DEFAULT 50,
    "empathy" INTEGER NOT NULL DEFAULT 50,
    "leadership" INTEGER NOT NULL DEFAULT 50,
    "independence" INTEGER NOT NULL DEFAULT 50,
    "impulsiveness" INTEGER NOT NULL DEFAULT 50,
    "humor" INTEGER NOT NULL DEFAULT 50,
    "temperament" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_personality_dna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_motion_dna" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "walk" TEXT,
    "run" TEXT,
    "jump" TEXT,
    "idle" TEXT,
    "turn" TEXT,
    "gesture_style" TEXT,
    "reaction_style" TEXT,
    "happy_motion" TEXT,
    "sad_motion" TEXT,
    "fear_motion" TEXT,
    "excited_motion" TEXT,
    "angry_motion" TEXT,
    "pending_review" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_motion_dna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_voice_dna" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "voice_profile" TEXT,
    "pitch" TEXT,
    "cadence" TEXT,
    "speed" TEXT,
    "energy" TEXT,
    "vocabulary" TEXT,
    "pronunciation" TEXT,
    "emotional_range" TEXT,
    "provider_type" TEXT,
    "provider_voice_id" TEXT,
    "pending_review" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_voice_dna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_story_dna" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "core_desire" TEXT,
    "main_fear" TEXT,
    "long_term_goal" TEXT,
    "growth_direction" TEXT,
    "weakness" TEXT,
    "lesson" TEXT,
    "conflicts" TEXT,
    "important_relationships" TEXT,
    "pending_review" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_story_dna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_3d_models" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "character_version_id" UUID,
    "model_name" TEXT NOT NULL,
    "master_blend_asset_id" UUID,
    "fbx_asset_id" UUID,
    "gltf_asset_id" UUID,
    "texture_set_id" UUID,
    "rig_id" UUID,
    "facial_rig_id" UUID,
    "material_set_id" UUID,
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "status" "CharacterModelStatus" NOT NULL DEFAULT 'MISSING',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "production_ready" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_3d_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "universe_id" UUID,
    "type" "AssetType" NOT NULL,
    "entity_type" TEXT,
    "entity_id" UUID,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "storage_location" TEXT,
    "mime_type" TEXT,
    "dimensions" TEXT,
    "duration_ms" INTEGER,
    "hash" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "missing" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "canon_facts_universe_id_idx" ON "canon_facts"("universe_id");

-- CreateIndex
CREATE INDEX "canon_facts_subject_type_subject_id_idx" ON "canon_facts"("subject_type", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "characters_internal_code_key" ON "characters"("internal_code");

-- CreateIndex
CREATE INDEX "characters_universe_id_idx" ON "characters"("universe_id");

-- CreateIndex
CREATE UNIQUE INDEX "character_versions_character_id_version_number_key" ON "character_versions"("character_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "character_visual_dna_character_id_key" ON "character_visual_dna"("character_id");

-- CreateIndex
CREATE UNIQUE INDEX "character_personality_dna_character_id_key" ON "character_personality_dna"("character_id");

-- CreateIndex
CREATE UNIQUE INDEX "character_motion_dna_character_id_key" ON "character_motion_dna"("character_id");

-- CreateIndex
CREATE UNIQUE INDEX "character_voice_dna_character_id_key" ON "character_voice_dna"("character_id");

-- CreateIndex
CREATE UNIQUE INDEX "character_story_dna_character_id_key" ON "character_story_dna"("character_id");

-- CreateIndex
CREATE INDEX "character_3d_models_character_id_idx" ON "character_3d_models"("character_id");

-- CreateIndex
CREATE INDEX "assets_type_idx" ON "assets"("type");

-- CreateIndex
CREATE INDEX "assets_entity_type_entity_id_idx" ON "assets"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "canon_facts" ADD CONSTRAINT "canon_facts_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_versions" ADD CONSTRAINT "character_versions_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_visual_dna" ADD CONSTRAINT "character_visual_dna_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_personality_dna" ADD CONSTRAINT "character_personality_dna_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_motion_dna" ADD CONSTRAINT "character_motion_dna_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_voice_dna" ADD CONSTRAINT "character_voice_dna_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_story_dna" ADD CONSTRAINT "character_story_dna_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_3d_models" ADD CONSTRAINT "character_3d_models_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_3d_models" ADD CONSTRAINT "character_3d_models_character_version_id_fkey" FOREIGN KEY ("character_version_id") REFERENCES "character_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
