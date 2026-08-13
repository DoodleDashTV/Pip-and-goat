-- DDP Steps 1-8 — direction layer persistence.
--
-- Purely additive. Two new tables; no existing table, column or constraint is
-- altered or dropped, so an existing database migrates forward without touching a
-- historical row and the rollback is a DROP TABLE of things nothing else references.

CREATE TABLE "production_blueprints" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "schema_version" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "cache_key" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "validation_status" TEXT NOT NULL DEFAULT 'PASS',
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "warning_count" INTEGER NOT NULL DEFAULT 0,
    "shot_count" INTEGER NOT NULL DEFAULT 0,
    "duration_seconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimated_cloud_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "content" JSONB NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_blueprints_pkey" PRIMARY KEY ("id")
);

-- Same episode plus same content hash is the same blueprint, so storing it twice
-- is a no-op rather than a duplicate.
CREATE UNIQUE INDEX "production_blueprints_episode_id_content_hash_key" ON "production_blueprints"("episode_id", "content_hash");
CREATE INDEX "production_blueprints_episode_id_created_at_idx" ON "production_blueprints"("episode_id", "created_at");

CREATE TABLE "director_overrides" (
    "id" UUID NOT NULL,
    "blueprint_id" UUID,
    "episode_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "from_value" JSONB,
    "to_value" JSONB,
    "created_by" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "refused_because" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "director_overrides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "director_overrides_episode_id_created_at_idx" ON "director_overrides"("episode_id", "created_at");
CREATE INDEX "director_overrides_blueprint_id_idx" ON "director_overrides"("blueprint_id");

-- SET NULL rather than CASCADE: a refused override is audit evidence, and deleting
-- a superseded blueprint should not erase the record that someone tried to loosen a
-- character lock.
ALTER TABLE "director_overrides"
    ADD CONSTRAINT "director_overrides_blueprint_id_fkey"
    FOREIGN KEY ("blueprint_id") REFERENCES "production_blueprints"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
