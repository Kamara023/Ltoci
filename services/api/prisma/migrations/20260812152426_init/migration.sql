-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "analytics";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "core";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ml";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ops";

-- CreateEnum
CREATE TYPE "core"."ValidationStatus" AS ENUM ('PENDING_REVIEW', 'VALID', 'INVALID');

-- CreateEnum
CREATE TYPE "ops"."SourceKind" AS ENUM ('SCRAPER', 'CSV', 'EXCEL', 'JSON', 'MANUAL', 'API');

-- CreateEnum
CREATE TYPE "ops"."RunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "app"."UserRole" AS ENUM ('USER', 'ADMIN', 'SUPERADMIN');

-- CreateTable
CREATE TABLE "core"."games" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL DEFAULT 'CI',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."game_number_set_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "game_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "numbers_count" SMALLINT NOT NULL,
    "number_min" SMALLINT NOT NULL,
    "number_max" SMALLINT NOT NULL,
    "display_order" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "game_number_set_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."draw_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "game_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scheduled_time" TIME(0),
    "days_of_week" SMALLINT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "draw_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."draws" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "game_id" UUID NOT NULL,
    "draw_type_id" UUID NOT NULL,
    "draw_date" DATE NOT NULL,
    "draw_time" TIME(0),
    "external_ref" TEXT,
    "status" "core"."ValidationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "source_id" UUID NOT NULL,
    "ingestion_run_id" UUID,
    "collected_at" TIMESTAMPTZ(6) NOT NULL,
    "validated_at" TIMESTAMPTZ(6),
    "validated_by" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."draw_number_sets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "draw_id" UUID NOT NULL,
    "set_type_id" UUID NOT NULL,
    "numbers" SMALLINT[],

    CONSTRAINT "draw_number_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops"."data_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "kind" "ops"."SourceKind" NOT NULL,
    "label" TEXT NOT NULL,
    "base_url" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" SMALLINT NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops"."ingestion_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_id" UUID NOT NULL,
    "triggered_by" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "status" "ops"."RunStatus" NOT NULL DEFAULT 'RUNNING',
    "stats" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "file_name" TEXT,

    CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops"."ingestion_events" (
    "id" BIGSERIAL NOT NULL,
    "run_id" UUID NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops"."data_quality_issues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "draw_id" UUID,
    "run_id" UUID,
    "rule_code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_quality_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops"."job_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "queue" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "job_key" TEXT,
    "status" "ops"."RunStatus" NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,
    "error" TEXT,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops"."audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics"."analysis_windows" (
    "code" TEXT NOT NULL,

    CONSTRAINT "analysis_windows_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "analytics"."number_stats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "game_id" UUID NOT NULL,
    "set_type_id" UUID NOT NULL,
    "draw_type_id" UUID,
    "window_code" TEXT NOT NULL,
    "number" SMALLINT NOT NULL,
    "frequency" INTEGER NOT NULL,
    "relative_freq" DECIMAL(8,6) NOT NULL,
    "current_gap" INTEGER NOT NULL,
    "avg_gap" DECIMAL(8,2),
    "max_gap" INTEGER,
    "last_seen_date" DATE,
    "trend" DECIMAL(8,4),
    "computed_at" TIMESTAMPTZ(6) NOT NULL,
    "as_of_draw_id" UUID NOT NULL,

    CONSTRAINT "number_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics"."pair_stats" (
    "game_id" UUID NOT NULL,
    "set_type_id" UUID NOT NULL,
    "window_code" TEXT NOT NULL,
    "number_a" SMALLINT NOT NULL,
    "number_b" SMALLINT NOT NULL,
    "frequency" INTEGER NOT NULL,
    "lift" DECIMAL(8,4),
    "computed_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pair_stats_pkey" PRIMARY KEY ("game_id","set_type_id","window_code","number_a","number_b")
);

-- CreateTable
CREATE TABLE "analytics"."draw_shape_stats" (
    "game_id" UUID NOT NULL,
    "set_type_id" UUID NOT NULL,
    "window_code" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "histogram" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "computed_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "draw_shape_stats_pkey" PRIMARY KEY ("game_id","set_type_id","window_code","metric")
);

-- CreateTable
CREATE TABLE "ml"."strategies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "default_config" JSONB NOT NULL DEFAULT '{}',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "min_plan" TEXT NOT NULL DEFAULT 'FREE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ml"."models" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "strategy_id" UUID,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "algo" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "trained_on_draws" INTEGER,
    "train_cutoff_draw_id" UUID,
    "artifact_path" TEXT,
    "metrics" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ml"."predictions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "game_id" UUID NOT NULL,
    "draw_type_id" UUID,
    "target_draw_date" DATE NOT NULL,
    "strategy_id" UUID NOT NULL,
    "model_id" UUID,
    "config_used" JSONB NOT NULL,
    "dataset_cutoff_draw_id" UUID NOT NULL,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ml"."prediction_combinations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "prediction_id" UUID NOT NULL,
    "rank" SMALLINT NOT NULL,
    "numbers" SMALLINT[],
    "score" DECIMAL(10,4) NOT NULL,
    "score_breakdown" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,

    CONSTRAINT "prediction_combinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ml"."backtests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "game_id" UUID NOT NULL,
    "draw_type_id" UUID,
    "strategy_id" UUID NOT NULL,
    "model_id" UUID,
    "config" JSONB NOT NULL,
    "from_draw_date" DATE NOT NULL,
    "to_draw_date" DATE NOT NULL,
    "status" "ops"."RunStatus" NOT NULL DEFAULT 'RUNNING',
    "metrics" JSONB,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "backtests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ml"."backtest_points" (
    "id" BIGSERIAL NOT NULL,
    "backtest_id" UUID NOT NULL,
    "target_draw_id" UUID NOT NULL,
    "cutoff_draw_id" UUID NOT NULL,
    "predicted" SMALLINT[],
    "actual" SMALLINT[],
    "matches" SMALLINT NOT NULL,

    CONSTRAINT "backtest_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT,
    "role" "app"."UserRole" NOT NULL DEFAULT 'USER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "email_verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "user_agent" TEXT,
    "ip" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."plans" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_monthly_xof" INTEGER NOT NULL DEFAULT 0,
    "entitlements" JSONB NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "app"."subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "plan_code" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "payment_ref" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "key_hash" TEXT NOT NULL,
    "label" TEXT,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."push_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "games_code_key" ON "core"."games"("code");

-- CreateIndex
CREATE UNIQUE INDEX "game_number_set_types_game_id_code_key" ON "core"."game_number_set_types"("game_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "draw_types_game_id_code_key" ON "core"."draw_types"("game_id", "code");

-- CreateIndex
CREATE INDEX "draws_game_id_draw_date_idx" ON "core"."draws"("game_id", "draw_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "draws_game_id_draw_type_id_draw_date_key" ON "core"."draws"("game_id", "draw_type_id", "draw_date");

-- CreateIndex
CREATE UNIQUE INDEX "draw_number_sets_draw_id_set_type_id_key" ON "core"."draw_number_sets"("draw_id", "set_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "data_sources_code_key" ON "ops"."data_sources"("code");

-- CreateIndex
CREATE INDEX "ingestion_runs_source_id_started_at_idx" ON "ops"."ingestion_runs"("source_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "ingestion_events_run_id_idx" ON "ops"."ingestion_events"("run_id");

-- CreateIndex
CREATE INDEX "data_quality_issues_draw_id_idx" ON "ops"."data_quality_issues"("draw_id");

-- CreateIndex
CREATE INDEX "job_runs_queue_started_at_idx" ON "ops"."job_runs"("queue", "started_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "ops"."audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "number_stats_game_id_window_code_idx" ON "analytics"."number_stats"("game_id", "window_code");

-- CreateIndex
CREATE UNIQUE INDEX "strategies_code_key" ON "ml"."strategies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "models_name_version_key" ON "ml"."models"("name", "version");

-- CreateIndex
CREATE INDEX "predictions_game_id_target_draw_date_idx" ON "ml"."predictions"("game_id", "target_draw_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "predictions_game_id_draw_type_id_target_draw_date_strategy__key" ON "ml"."predictions"("game_id", "draw_type_id", "target_draw_date", "strategy_id");

-- CreateIndex
CREATE UNIQUE INDEX "prediction_combinations_prediction_id_rank_key" ON "ml"."prediction_combinations"("prediction_id", "rank");

-- CreateIndex
CREATE INDEX "backtest_points_backtest_id_idx" ON "ml"."backtest_points"("backtest_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "app"."users"("email");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "app"."refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_status_idx" ON "app"."subscriptions"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "app"."api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "app"."notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "app"."push_tokens"("token");

-- AddForeignKey
ALTER TABLE "core"."game_number_set_types" ADD CONSTRAINT "game_number_set_types_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "core"."games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."draw_types" ADD CONSTRAINT "draw_types_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "core"."games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."draws" ADD CONSTRAINT "draws_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "core"."games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."draws" ADD CONSTRAINT "draws_draw_type_id_fkey" FOREIGN KEY ("draw_type_id") REFERENCES "core"."draw_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."draws" ADD CONSTRAINT "draws_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "ops"."data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."draws" ADD CONSTRAINT "draws_ingestion_run_id_fkey" FOREIGN KEY ("ingestion_run_id") REFERENCES "ops"."ingestion_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."draws" ADD CONSTRAINT "draws_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."draw_number_sets" ADD CONSTRAINT "draw_number_sets_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "core"."draws"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."draw_number_sets" ADD CONSTRAINT "draw_number_sets_set_type_id_fkey" FOREIGN KEY ("set_type_id") REFERENCES "core"."game_number_set_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."ingestion_runs" ADD CONSTRAINT "ingestion_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "ops"."data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."ingestion_events" ADD CONSTRAINT "ingestion_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ops"."ingestion_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."data_quality_issues" ADD CONSTRAINT "data_quality_issues_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "core"."draws"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."data_quality_issues" ADD CONSTRAINT "data_quality_issues_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ops"."ingestion_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."data_quality_issues" ADD CONSTRAINT "data_quality_issues_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics"."number_stats" ADD CONSTRAINT "number_stats_window_code_fkey" FOREIGN KEY ("window_code") REFERENCES "analytics"."analysis_windows"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics"."number_stats" ADD CONSTRAINT "number_stats_as_of_draw_id_fkey" FOREIGN KEY ("as_of_draw_id") REFERENCES "core"."draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml"."models" ADD CONSTRAINT "models_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "ml"."strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml"."models" ADD CONSTRAINT "models_train_cutoff_draw_id_fkey" FOREIGN KEY ("train_cutoff_draw_id") REFERENCES "core"."draws"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml"."predictions" ADD CONSTRAINT "predictions_draw_type_id_fkey" FOREIGN KEY ("draw_type_id") REFERENCES "core"."draw_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml"."predictions" ADD CONSTRAINT "predictions_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "ml"."strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml"."predictions" ADD CONSTRAINT "predictions_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ml"."models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml"."predictions" ADD CONSTRAINT "predictions_dataset_cutoff_draw_id_fkey" FOREIGN KEY ("dataset_cutoff_draw_id") REFERENCES "core"."draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml"."prediction_combinations" ADD CONSTRAINT "prediction_combinations_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "ml"."predictions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml"."backtests" ADD CONSTRAINT "backtests_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "ml"."strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml"."backtests" ADD CONSTRAINT "backtests_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ml"."models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml"."backtest_points" ADD CONSTRAINT "backtest_points_backtest_id_fkey" FOREIGN KEY ("backtest_id") REFERENCES "ml"."backtests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml"."backtest_points" ADD CONSTRAINT "backtest_points_target_draw_id_fkey" FOREIGN KEY ("target_draw_id") REFERENCES "core"."draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml"."backtest_points" ADD CONSTRAINT "backtest_points_cutoff_draw_id_fkey" FOREIGN KEY ("cutoff_draw_id") REFERENCES "core"."draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."subscriptions" ADD CONSTRAINT "subscriptions_plan_code_fkey" FOREIGN KEY ("plan_code") REFERENCES "app"."plans"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."push_tokens" ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
