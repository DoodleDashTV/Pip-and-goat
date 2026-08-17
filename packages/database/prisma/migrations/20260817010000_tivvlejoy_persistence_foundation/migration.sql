-- TivvleJoy persistence foundation.
--
-- Purely additive. New tables only. No existing table, column, or constraint
-- is altered or dropped. These tables are not written until a later authorized
-- production connect. Public Preview keeps using browser localStorage.

CREATE TABLE "tivvlejoy_workspaces" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "project_name" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT '1080x1920',
    "fps" INTEGER NOT NULL DEFAULT 30,
    "paid_resources_authorized" BOOLEAN NOT NULL DEFAULT false,
    "theatrical_binding_completed" BOOLEAN NOT NULL DEFAULT false,
    "durable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tivvlejoy_workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tivvlejoy_productions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "durable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tivvlejoy_productions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tivvlejoy_episodes" (
    "id" UUID NOT NULL,
    "production_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "episode_number" INTEGER NOT NULL,
    "duration_sec" INTEGER NOT NULL,
    "premise" TEXT NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'PREVIEW_NONCANONICAL',
    "current_stage" TEXT NOT NULL,
    "completed_stages" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tivvlejoy_episodes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tivvlejoy_assets" (
    "id" UUID NOT NULL,
    "production_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED_METADATA_ONLY',
    "classification" TEXT NOT NULL DEFAULT 'PREVIEW_NONCANONICAL',
    "canonical" BOOLEAN NOT NULL DEFAULT false,
    "object_key" TEXT,
    "content_type" TEXT,
    "byte_size" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tivvlejoy_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tivvlejoy_voice_profiles" (
    "id" UUID NOT NULL,
    "production_id" UUID NOT NULL,
    "character_label" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "provider_voice_id" TEXT,
    "audition_available" BOOLEAN NOT NULL DEFAULT false,
    "consent_recorded_likeness" BOOLEAN NOT NULL DEFAULT false,
    "consent_voice_cloning_authorized" BOOLEAN NOT NULL DEFAULT false,
    "consent_recorded_at" TIMESTAMP(3),
    "consent_notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tivvlejoy_voice_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tivvlejoy_workflow_statuses" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "current_stage" TEXT NOT NULL,
    "completed_stages" JSONB NOT NULL,
    "blocked_reason" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tivvlejoy_workflow_statuses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tivvlejoy_readiness_results" (
    "id" UUID NOT NULL,
    "production_id" UUID NOT NULL,
    "production_ready" BOOLEAN NOT NULL DEFAULT false,
    "items" JSONB NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tivvlejoy_readiness_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tivvlejoy_render_requests" (
    "id" UUID NOT NULL,
    "production_id" UUID NOT NULL,
    "episode_id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Draft request — not rendered',
    "status" TEXT NOT NULL DEFAULT 'NOT_RENDERED',
    "contacted_provider" BOOLEAN NOT NULL DEFAULT false,
    "output_file" TEXT,
    "progress" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tivvlejoy_render_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tivvlejoy_audit_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "detail" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tivvlejoy_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tivvlejoy_productions_workspace_id_created_at_idx" ON "tivvlejoy_productions"("workspace_id", "created_at");
CREATE INDEX "tivvlejoy_episodes_production_id_episode_number_idx" ON "tivvlejoy_episodes"("production_id", "episode_number");
CREATE INDEX "tivvlejoy_assets_production_id_created_at_idx" ON "tivvlejoy_assets"("production_id", "created_at");
CREATE INDEX "tivvlejoy_voice_profiles_production_id_created_at_idx" ON "tivvlejoy_voice_profiles"("production_id", "created_at");
CREATE UNIQUE INDEX "tivvlejoy_workflow_statuses_episode_id_key" ON "tivvlejoy_workflow_statuses"("episode_id");
CREATE INDEX "tivvlejoy_readiness_results_production_id_evaluated_at_idx" ON "tivvlejoy_readiness_results"("production_id", "evaluated_at");
CREATE INDEX "tivvlejoy_render_requests_production_id_created_at_idx" ON "tivvlejoy_render_requests"("production_id", "created_at");
CREATE INDEX "tivvlejoy_audit_events_workspace_id_created_at_idx" ON "tivvlejoy_audit_events"("workspace_id", "created_at");

ALTER TABLE "tivvlejoy_productions" ADD CONSTRAINT "tivvlejoy_productions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "tivvlejoy_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tivvlejoy_episodes" ADD CONSTRAINT "tivvlejoy_episodes_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "tivvlejoy_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tivvlejoy_assets" ADD CONSTRAINT "tivvlejoy_assets_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "tivvlejoy_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tivvlejoy_voice_profiles" ADD CONSTRAINT "tivvlejoy_voice_profiles_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "tivvlejoy_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tivvlejoy_workflow_statuses" ADD CONSTRAINT "tivvlejoy_workflow_statuses_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "tivvlejoy_episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tivvlejoy_readiness_results" ADD CONSTRAINT "tivvlejoy_readiness_results_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "tivvlejoy_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tivvlejoy_render_requests" ADD CONSTRAINT "tivvlejoy_render_requests_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "tivvlejoy_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tivvlejoy_audit_events" ADD CONSTRAINT "tivvlejoy_audit_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "tivvlejoy_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
