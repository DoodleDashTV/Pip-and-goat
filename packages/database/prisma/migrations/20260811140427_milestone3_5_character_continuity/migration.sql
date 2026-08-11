-- CreateTable
CREATE TABLE "character_development" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "courage" INTEGER NOT NULL DEFAULT 50,
    "patience" INTEGER NOT NULL DEFAULT 50,
    "empathy" INTEGER NOT NULL DEFAULT 50,
    "leadership" INTEGER NOT NULL DEFAULT 50,
    "independence" INTEGER NOT NULL DEFAULT 50,
    "curiosity" INTEGER NOT NULL DEFAULT 50,
    "responsibility" INTEGER NOT NULL DEFAULT 50,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_development_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_development_events" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "attribute" TEXT NOT NULL,
    "previous_value" INTEGER NOT NULL,
    "new_value" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "story_event_ref" TEXT NOT NULL,
    "episode_id" UUID,
    "summary" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_development_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_relationships" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "from_character_id" UUID NOT NULL,
    "to_character_id" UUID NOT NULL,
    "trust" INTEGER NOT NULL DEFAULT 50,
    "friendship" INTEGER NOT NULL DEFAULT 50,
    "respect" INTEGER NOT NULL DEFAULT 50,
    "dependence" INTEGER NOT NULL DEFAULT 50,
    "tension" INTEGER NOT NULL DEFAULT 20,
    "rivalry" INTEGER NOT NULL DEFAULT 10,
    "familiarity" INTEGER NOT NULL DEFAULT 50,
    "label" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship_events" (
    "id" UUID NOT NULL,
    "relationship_id" UUID NOT NULL,
    "attribute" TEXT NOT NULL,
    "previous_value" INTEGER NOT NULL,
    "new_value" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "story_event_ref" TEXT NOT NULL,
    "episode_id" UUID,
    "summary" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relationship_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "character_development_character_id_key" ON "character_development"("character_id");

-- CreateIndex
CREATE INDEX "character_development_events_character_id_idx" ON "character_development_events"("character_id");

-- CreateIndex
CREATE INDEX "character_development_events_story_event_ref_idx" ON "character_development_events"("story_event_ref");

-- CreateIndex
CREATE INDEX "character_relationships_universe_id_idx" ON "character_relationships"("universe_id");

-- CreateIndex
CREATE UNIQUE INDEX "character_relationships_from_character_id_to_character_id_key" ON "character_relationships"("from_character_id", "to_character_id");

-- CreateIndex
CREATE INDEX "relationship_events_relationship_id_idx" ON "relationship_events"("relationship_id");

-- CreateIndex
CREATE INDEX "relationship_events_story_event_ref_idx" ON "relationship_events"("story_event_ref");

-- AddForeignKey
ALTER TABLE "character_development" ADD CONSTRAINT "character_development_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_development_events" ADD CONSTRAINT "character_development_events_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_from_character_id_fkey" FOREIGN KEY ("from_character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_to_character_id_fkey" FOREIGN KEY ("to_character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_events" ADD CONSTRAINT "relationship_events_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "character_relationships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
