-- AlterEnum
ALTER TYPE "IntakeAssetKind" ADD VALUE 'PRIMARY_CANONICAL_REFERENCE';

-- CreateTable
CREATE TABLE "character_canonical_packages" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "character_code" TEXT NOT NULL,
    "dna_version" INTEGER NOT NULL DEFAULT 1,
    "locked_traits" JSONB NOT NULL,
    "style_lock" JSONB,
    "accessory_canon" JSONB,
    "rig_requirements" JSONB,
    "facial_requirements" JSONB,
    "viseme_requirements" JSONB,
    "primary_reference_version_id" UUID,
    "primary_reference_approved_at" TIMESTAMP(3),
    "immutable" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_canonical_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shot_accessory_states" (
    "id" UUID NOT NULL,
    "shot_id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "accessories" JSONB NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shot_accessory_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_model_reviews" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "model_intake_id" UUID NOT NULL,
    "reference_version_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "checklist" JSONB,
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_model_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "character_canonical_packages_character_id_key" ON "character_canonical_packages"("character_id");

-- CreateIndex
CREATE INDEX "character_canonical_packages_character_code_idx" ON "character_canonical_packages"("character_code");

-- CreateIndex
CREATE INDEX "shot_accessory_states_character_id_idx" ON "shot_accessory_states"("character_id");

-- CreateIndex
CREATE UNIQUE INDEX "shot_accessory_states_shot_id_character_id_key" ON "shot_accessory_states"("shot_id", "character_id");

-- CreateIndex
CREATE INDEX "production_model_reviews_character_id_status_idx" ON "production_model_reviews"("character_id", "status");
