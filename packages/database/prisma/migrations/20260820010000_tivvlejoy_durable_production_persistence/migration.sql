-- TivvleJoy durable production persistence (orchestration references only).
-- Additive tables. No commercial bytes. No Production connection required.

CREATE TABLE "tivvlejoy_durable_workspaces" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "entity_version" TEXT NOT NULL,
    "dependency_sha256" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "tivvlejoy_durable_workspaces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tivvlejoy_durable_workspaces_workspace_id_key" ON "tivvlejoy_durable_workspaces"("workspace_id");

CREATE TABLE "tivvlejoy_durable_records" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "entity_version" TEXT NOT NULL,
    "dependency_sha256" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "tivvlejoy_durable_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tivvlejoy_durable_records_workspace_id_entity_type_entity_id_key" ON "tivvlejoy_durable_records"("workspace_id", "entity_type", "entity_id");
CREATE INDEX "tivvlejoy_durable_records_workspace_id_entity_type_idx" ON "tivvlejoy_durable_records"("workspace_id", "entity_type");

CREATE TABLE "tivvlejoy_durable_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "previous_revision" INTEGER NOT NULL,
    "next_revision" INTEGER NOT NULL,
    "dependency_sha256" TEXT NOT NULL,
    "payload_sha256" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "actor_class" TEXT NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "tivvlejoy_durable_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tivvlejoy_durable_events_workspace_id_next_revision_idx" ON "tivvlejoy_durable_events"("workspace_id", "next_revision");

CREATE TABLE "tivvlejoy_durable_snapshots" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "journal_position" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot_sha256" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "records" JSONB NOT NULL,

    CONSTRAINT "tivvlejoy_durable_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tivvlejoy_durable_snapshots_workspace_id_revision_idx" ON "tivvlejoy_durable_snapshots"("workspace_id", "revision");

ALTER TABLE "tivvlejoy_durable_records" ADD CONSTRAINT "tivvlejoy_durable_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "tivvlejoy_durable_workspaces"("workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tivvlejoy_durable_events" ADD CONSTRAINT "tivvlejoy_durable_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "tivvlejoy_durable_workspaces"("workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tivvlejoy_durable_snapshots" ADD CONSTRAINT "tivvlejoy_durable_snapshots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "tivvlejoy_durable_workspaces"("workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
