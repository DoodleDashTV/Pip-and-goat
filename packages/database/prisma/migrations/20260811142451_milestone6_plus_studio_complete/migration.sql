-- CreateEnum
CREATE TYPE "StoryWorkflowStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_PRODUCTION', 'LOCKED');

-- CreateEnum
CREATE TYPE "ThreadStatus" AS ENUM ('OPEN', 'PLANTED', 'PAYING_OFF', 'RESOLVED', 'DROPPED', 'PLANNED', 'ACTIVE', 'PAUSED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ForeshadowStatus" AS ENUM ('PLANNED', 'PLANTED', 'PAID_OFF', 'RETIRED');

-- CreateEnum
CREATE TYPE "PropCondition" AS ENUM ('NEW', 'GOOD', 'WORN', 'DAMAGED', 'LOST', 'RESTORED');

-- CreateEnum
CREATE TYPE "RenderJobStatus" AS ENUM ('QUEUED', 'PREPARING', 'RENDERING', 'ENCODING', 'QUALITY_CHECK', 'COMPLETE', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "internal_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "environment_type" TEXT,
    "lighting_rules" TEXT,
    "palette" TEXT,
    "landmarks" TEXT,
    "weather_rules" TEXT,
    "time_of_day_rules" TEXT,
    "history" TEXT,
    "master_blend_asset_id" UUID,
    "map_x" DOUBLE PRECISION,
    "map_y" DOUBLE PRECISION,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "status" "RegistryApprovalStatus" NOT NULL DEFAULT 'MISSING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_versions" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "version_name" TEXT NOT NULL,
    "change_summary" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_variants" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "notes" TEXT,
    "asset_id" UUID,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_connections" (
    "id" UUID NOT NULL,
    "from_location_id" UUID NOT NULL,
    "to_location_id" UUID NOT NULL,
    "travel_description" TEXT,
    "bidirectional" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "props" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "internal_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "owner_character_id" UUID,
    "location_id" UUID,
    "condition" "PropCondition" NOT NULL DEFAULT 'GOOD',
    "story_significance" TEXT,
    "current_state" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "status" "RegistryApprovalStatus" NOT NULL DEFAULT 'MISSING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "props_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prop_versions" (
    "id" UUID NOT NULL,
    "prop_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "version_name" TEXT NOT NULL,
    "change_summary" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prop_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prop_history" (
    "id" UUID NOT NULL,
    "prop_id" UUID NOT NULL,
    "story_event_ref" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "condition" "PropCondition",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prop_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_bibles" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "style_bibles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_presets" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "asset_id" UUID,
    "status" "RegistryApprovalStatus" NOT NULL DEFAULT 'MISSING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lighting_presets" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lighting_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "camera_presets" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "camera_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vfx_presets" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "asset_id" UUID,
    "status" "RegistryApprovalStatus" NOT NULL DEFAULT 'MISSING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vfx_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "season_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "logline" TEXT NOT NULL,
    "theme" TEXT,
    "target_episode_count" INTEGER NOT NULL DEFAULT 10,
    "status" "StoryWorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "approval_status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approved_for_production" BOOLEAN NOT NULL DEFAULT false,
    "proposal" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season_arcs" (
    "id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "season_arcs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episodes" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "season_id" UUID,
    "episode_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "logline" TEXT NOT NULL,
    "synopsis" TEXT,
    "duration_sec" INTEGER,
    "hook" TEXT,
    "objective" TEXT,
    "problem" TEXT,
    "conflict" TEXT,
    "adventure" TEXT,
    "character_moment" TEXT,
    "emotional_beat" TEXT,
    "resolution" TEXT,
    "lesson" TEXT,
    "callback" TEXT,
    "season_advancement" TEXT,
    "next_episode_seed" TEXT,
    "status" "StoryWorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_threads" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "season_id" UUID,
    "episode_id" UUID,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "status" "ThreadStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_thread_events" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "story_event_ref" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_thread_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foreshadowings" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "thread_id" UUID,
    "planted_episode_id" UUID,
    "payoff_episode_id" UUID,
    "clue" TEXT NOT NULL,
    "intended_payoff" TEXT NOT NULL,
    "subtlety" INTEGER NOT NULL DEFAULT 60,
    "foreshadow_type" TEXT,
    "status" "ForeshadowStatus" NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "foreshadowings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episode_memories" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "episode_id" UUID,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID,
    "statement" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 50,
    "source" TEXT,
    "locked_canon_mutation" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "episode_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storyboards" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "StoryWorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storyboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storyboard_panels" (
    "id" UUID NOT NULL,
    "storyboard_id" UUID NOT NULL,
    "panel_number" INTEGER NOT NULL,
    "scene_hint" TEXT,
    "shot_hint" TEXT,
    "characters" JSONB,
    "location_code" TEXT,
    "pose" TEXT,
    "camera" TEXT,
    "dialogue" TEXT,
    "action" TEXT,
    "duration_sec" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storyboard_panels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "storyboard_id" UUID,
    "scene_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location_id" UUID,
    "character_ids" JSONB NOT NULL DEFAULT '[]',
    "emotional_beat" TEXT,
    "duration_sec" DOUBLE PRECISION,
    "lighting_preset" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shots" (
    "id" UUID NOT NULL,
    "scene_id" UUID NOT NULL,
    "shot_number" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "camera_preset" TEXT,
    "lighting_preset" TEXT,
    "duration_seconds" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "character_ids" JSONB NOT NULL DEFAULT '[]',
    "production_notes" TEXT,
    "render_mode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "render_workers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "capabilities" JSONB,
    "last_heartbeat_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "render_workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "render_jobs" (
    "id" UUID NOT NULL,
    "episode_id" UUID,
    "shot_id" UUID,
    "worker_id" UUID,
    "render_mode" TEXT,
    "status" "RenderJobStatus" NOT NULL DEFAULT 'QUEUED',
    "cinematic_importance" INTEGER,
    "estimated_cost_units" DOUBLE PRECISION,
    "estimated_minutes" DOUBLE PRECISION,
    "rationale" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "resolution" TEXT,
    "fps" INTEGER,
    "engine" TEXT,
    "payload" JSONB,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "render_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "render_attempts" (
    "id" UUID NOT NULL,
    "render_job_id" UUID NOT NULL,
    "worker_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "error" TEXT,
    "metadata" JSONB,

    CONSTRAINT "render_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "render_outputs" (
    "id" UUID NOT NULL,
    "render_job_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'preview',
    "uri" TEXT NOT NULL,
    "resolution" TEXT,
    "checksum" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "render_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "render_assets" (
    "id" UUID NOT NULL,
    "render_job_id" UUID,
    "role" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "checksum" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "render_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_requests" (
    "id" UUID NOT NULL,
    "universe_id" UUID,
    "episode_id" UUID,
    "shot_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "asset_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_profiles" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "character_id" UUID,
    "name" TEXT NOT NULL,
    "provider_type" TEXT,
    "provider_voice_id" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "pending_review" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dialogue_lines" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "speaker_id" UUID,
    "text" TEXT NOT NULL,
    "start_ms" INTEGER,
    "end_ms" INTEGER,
    "emotion" TEXT,
    "intensity" INTEGER,
    "speed" DOUBLE PRECISION,
    "emphasis" TEXT,
    "pause_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dialogue_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lip_sync_tracks" (
    "id" UUID NOT NULL,
    "dialogue_line_id" UUID NOT NULL,
    "viseme_timeline" JSONB NOT NULL,
    "audio_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lip_sync_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sound_clips" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tags" TEXT[],
    "asset_id" UUID,
    "status" "RegistryApprovalStatus" NOT NULL DEFAULT 'MISSING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sound_clips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_tracks" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "asset_id" UUID,
    "status" "RegistryApprovalStatus" NOT NULL DEFAULT 'MISSING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "music_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editor_timelines" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "tracks" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "editor_timelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publishing_releases" (
    "id" UUID NOT NULL,
    "universe_id" UUID,
    "episode_id" UUID,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "package_meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publishing_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_ledger_entries" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "episode_id" UUID,
    "category" TEXT NOT NULL,
    "amount_units" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_metrics" (
    "id" UUID NOT NULL,
    "universe_id" UUID NOT NULL,
    "episode_id" UUID,
    "metric_key" TEXT NOT NULL,
    "metric_value" DOUBLE PRECISION NOT NULL,
    "dimensions" JSONB,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_timeline_events" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "story_event_ref" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "episode_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "locations_universe_id_internal_code_key" ON "locations"("universe_id", "internal_code");

-- CreateIndex
CREATE UNIQUE INDEX "location_versions_location_id_version_number_key" ON "location_versions"("location_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "location_variants_location_id_code_key" ON "location_variants"("location_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "location_connections_from_location_id_to_location_id_key" ON "location_connections"("from_location_id", "to_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "props_universe_id_internal_code_key" ON "props"("universe_id", "internal_code");

-- CreateIndex
CREATE UNIQUE INDEX "prop_versions_prop_id_version_number_key" ON "prop_versions"("prop_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "style_bibles_universe_id_name_version_key" ON "style_bibles"("universe_id", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "material_presets_universe_id_code_key" ON "material_presets"("universe_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "lighting_presets_universe_id_code_key" ON "lighting_presets"("universe_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "camera_presets_universe_id_code_key" ON "camera_presets"("universe_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "vfx_presets_universe_id_code_key" ON "vfx_presets"("universe_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_universe_id_season_number_key" ON "seasons"("universe_id", "season_number");

-- CreateIndex
CREATE UNIQUE INDEX "episodes_universe_id_season_id_episode_number_key" ON "episodes"("universe_id", "season_id", "episode_number");

-- CreateIndex
CREATE UNIQUE INDEX "storyboard_panels_storyboard_id_panel_number_key" ON "storyboard_panels"("storyboard_id", "panel_number");

-- CreateIndex
CREATE UNIQUE INDEX "scenes_episode_id_scene_number_key" ON "scenes"("episode_id", "scene_number");

-- CreateIndex
CREATE UNIQUE INDEX "shots_scene_id_shot_number_key" ON "shots"("scene_id", "shot_number");

-- CreateIndex
CREATE INDEX "render_jobs_status_priority_idx" ON "render_jobs"("status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "lip_sync_tracks_dialogue_line_id_key" ON "lip_sync_tracks"("dialogue_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "sound_clips_universe_id_code_key" ON "sound_clips"("universe_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "music_tracks_universe_id_code_key" ON "music_tracks"("universe_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "editor_timelines_episode_id_key" ON "editor_timelines"("episode_id");

-- CreateIndex
CREATE INDEX "character_timeline_events_character_id_idx" ON "character_timeline_events"("character_id");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_versions" ADD CONSTRAINT "location_versions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_variants" ADD CONSTRAINT "location_variants_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_connections" ADD CONSTRAINT "location_connections_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_connections" ADD CONSTRAINT "location_connections_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "props" ADD CONSTRAINT "props_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "props" ADD CONSTRAINT "props_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prop_versions" ADD CONSTRAINT "prop_versions_prop_id_fkey" FOREIGN KEY ("prop_id") REFERENCES "props"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prop_history" ADD CONSTRAINT "prop_history_prop_id_fkey" FOREIGN KEY ("prop_id") REFERENCES "props"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_bibles" ADD CONSTRAINT "style_bibles_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_presets" ADD CONSTRAINT "material_presets_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lighting_presets" ADD CONSTRAINT "lighting_presets_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camera_presets" ADD CONSTRAINT "camera_presets_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vfx_presets" ADD CONSTRAINT "vfx_presets_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_arcs" ADD CONSTRAINT "season_arcs_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_threads" ADD CONSTRAINT "story_threads_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_threads" ADD CONSTRAINT "story_threads_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_threads" ADD CONSTRAINT "story_threads_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_thread_events" ADD CONSTRAINT "story_thread_events_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "story_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foreshadowings" ADD CONSTRAINT "foreshadowings_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foreshadowings" ADD CONSTRAINT "foreshadowings_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "story_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_memories" ADD CONSTRAINT "episode_memories_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_memories" ADD CONSTRAINT "episode_memories_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storyboards" ADD CONSTRAINT "storyboards_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storyboard_panels" ADD CONSTRAINT "storyboard_panels_storyboard_id_fkey" FOREIGN KEY ("storyboard_id") REFERENCES "storyboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_storyboard_id_fkey" FOREIGN KEY ("storyboard_id") REFERENCES "storyboards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shots" ADD CONSTRAINT "shots_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "shots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "render_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "render_attempts" ADD CONSTRAINT "render_attempts_render_job_id_fkey" FOREIGN KEY ("render_job_id") REFERENCES "render_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "render_outputs" ADD CONSTRAINT "render_outputs_render_job_id_fkey" FOREIGN KEY ("render_job_id") REFERENCES "render_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "render_assets" ADD CONSTRAINT "render_assets_render_job_id_fkey" FOREIGN KEY ("render_job_id") REFERENCES "render_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dialogue_lines" ADD CONSTRAINT "dialogue_lines_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lip_sync_tracks" ADD CONSTRAINT "lip_sync_tracks_dialogue_line_id_fkey" FOREIGN KEY ("dialogue_line_id") REFERENCES "dialogue_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sound_clips" ADD CONSTRAINT "sound_clips_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "music_tracks" ADD CONSTRAINT "music_tracks_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_timelines" ADD CONSTRAINT "editor_timelines_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publishing_releases" ADD CONSTRAINT "publishing_releases_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publishing_releases" ADD CONSTRAINT "publishing_releases_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_ledger_entries" ADD CONSTRAINT "cost_ledger_entries_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_metrics" ADD CONSTRAINT "analytics_metrics_universe_id_fkey" FOREIGN KEY ("universe_id") REFERENCES "universes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
