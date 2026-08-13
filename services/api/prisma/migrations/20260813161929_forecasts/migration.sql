-- DropIndex
DROP INDEX "core"."idx_dns_numbers";

-- CreateTable
CREATE TABLE "ml"."forecasts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "game_id" UUID NOT NULL,
    "draw_type_id" UUID NOT NULL,
    "target_date" DATE NOT NULL,
    "dataset_cutoff_draw_id" UUID NOT NULL,
    "model_versions" JSONB NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMPTZ(6),

    CONSTRAINT "forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ml"."forecast_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "forecast_id" UUID NOT NULL,
    "rank" SMALLINT NOT NULL,
    "number" SMALLINT NOT NULL,
    "score" DECIMAL(10,6) NOT NULL,
    "confidence" TEXT NOT NULL,
    "factors" JSONB NOT NULL,
    "consensus_count" SMALLINT NOT NULL,

    CONSTRAINT "forecast_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ml"."forecast_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "forecast_id" UUID NOT NULL,
    "actual_draw_id" UUID NOT NULL,
    "actual_numbers" SMALLINT[],
    "hits_top5" SMALLINT NOT NULL,
    "hits_top10" SMALLINT NOT NULL,
    "matched_numbers" SMALLINT[],
    "evaluated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecast_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "forecasts_game_id_draw_type_id_target_date_idx" ON "ml"."forecasts"("game_id", "draw_type_id", "target_date");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_entries_forecast_id_rank_key" ON "ml"."forecast_entries"("forecast_id", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_results_forecast_id_key" ON "ml"."forecast_results"("forecast_id");

-- AddForeignKey
ALTER TABLE "ml"."forecasts" ADD CONSTRAINT "forecasts_draw_type_id_fkey" FOREIGN KEY ("draw_type_id") REFERENCES "core"."draw_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml"."forecasts" ADD CONSTRAINT "forecasts_dataset_cutoff_draw_id_fkey" FOREIGN KEY ("dataset_cutoff_draw_id") REFERENCES "core"."draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml"."forecast_entries" ADD CONSTRAINT "forecast_entries_forecast_id_fkey" FOREIGN KEY ("forecast_id") REFERENCES "ml"."forecasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml"."forecast_results" ADD CONSTRAINT "forecast_results_forecast_id_fkey" FOREIGN KEY ("forecast_id") REFERENCES "ml"."forecasts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml"."forecast_results" ADD CONSTRAINT "forecast_results_actual_draw_id_fkey" FOREIGN KEY ("actual_draw_id") REFERENCES "core"."draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Compléments PHASE 11 (non exprimables en Prisma)
-- ============================================================

-- Une seule prévision ACTIVE par cible (les supersédées gardent l'historique).
CREATE UNIQUE INDEX "uq_forecast_active_target"
  ON "ml"."forecasts" ("game_id", "draw_type_id", "target_date")
  WHERE "superseded_at" IS NULL;

-- IMMUABILITÉ : un forecast évalué (résultat présent) ne peut plus être
-- modifié ni supprimé ; un résultat ne peut jamais être modifié/supprimé.
CREATE OR REPLACE FUNCTION "ml".forbid_forecast_mutation() RETURNS trigger AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM "ml"."forecast_results" r WHERE r.forecast_id = OLD.id) THEN
        RAISE EXCEPTION 'FORECAST_FROZEN: prevision evaluee, modification interdite';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_forecast_frozen"
    BEFORE UPDATE OR DELETE ON "ml"."forecasts"
    FOR EACH ROW EXECUTE FUNCTION "ml".forbid_forecast_mutation();

CREATE OR REPLACE FUNCTION "ml".forbid_result_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'FORECAST_RESULT_IMMUTABLE: resultat de prevision immuable';
END $$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_forecast_result_immutable"
    BEFORE UPDATE OR DELETE ON "ml"."forecast_results"
    FOR EACH ROW EXECUTE FUNCTION "ml".forbid_result_mutation();
