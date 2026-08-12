-- ============================================================
-- Compléments SQL non exprimables dans le schéma Prisma.
-- Conception : docs/02-modele-donnees.md
-- ============================================================

-- 1) Index GIN — requêtes « tirages contenant le numéro N »
CREATE INDEX "idx_dns_numbers"
  ON "core"."draw_number_sets" USING gin ("numbers");

-- 2) Index partiel — file de revue du backoffice (tirages non validés)
CREATE INDEX "idx_draws_status_pending"
  ON "core"."draws" ("status")
  WHERE "status" <> 'VALID'::"core"."ValidationStatus";

-- 3) Unicité métier de analytics.number_stats.
--    draw_type_id NULL signifie « tous tirages confondus » : un index unique
--    classique ignorerait les NULL, d'où le COALESCE vers l'UUID nul.
CREATE UNIQUE INDEX "uq_number_stats_scope"
  ON "analytics"."number_stats" (
    "game_id",
    "set_type_id",
    COALESCE("draw_type_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "window_code",
    "number"
  );

-- 4) Trigger d'intégrité des ensembles de numéros.
--    Garantit, quelle que soit l'application cliente (API Node, service ML,
--    SQL manuel) : cardinalité conforme au type d'ensemble, bornes respectées,
--    absence de doublon, et normalisation par tri croissant.
CREATE OR REPLACE FUNCTION "core".check_draw_number_set() RETURNS trigger AS $$
DECLARE
    cfg "core"."game_number_set_types"%ROWTYPE;
    sorted smallint[];
BEGIN
    SELECT * INTO cfg FROM "core"."game_number_set_types" WHERE id = NEW.set_type_id;
    IF cfg.id IS NULL THEN
        RAISE EXCEPTION 'draw_number_sets: set_type % introuvable', NEW.set_type_id;
    END IF;

    IF COALESCE(array_length(NEW.numbers, 1), 0) IS DISTINCT FROM cfg.numbers_count::int THEN
        RAISE EXCEPTION 'BAD_CARDINALITY: % numeros attendus, % recus',
            cfg.numbers_count, COALESCE(array_length(NEW.numbers, 1), 0);
    END IF;

    IF EXISTS (
        SELECT 1 FROM unnest(NEW.numbers) AS n
        WHERE n < cfg.number_min OR n > cfg.number_max
    ) THEN
        RAISE EXCEPTION 'OUT_OF_RANGE: numeros hors plage [%..%]',
            cfg.number_min, cfg.number_max;
    END IF;

    SELECT array_agg(n ORDER BY n) INTO sorted
    FROM (SELECT DISTINCT unnest(NEW.numbers) AS n) AS d;
    IF array_length(sorted, 1) <> array_length(NEW.numbers, 1) THEN
        RAISE EXCEPTION 'DUP_IN_SET: numeros dupliques dans l''ensemble';
    END IF;

    -- Normalisation : tri croissant systématique.
    NEW.numbers := sorted;
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_check_draw_number_set"
    BEFORE INSERT OR UPDATE ON "core"."draw_number_sets"
    FOR EACH ROW EXECUTE FUNCTION "core".check_draw_number_set();

-- 5) Vue normalisée « 1 ligne = 1 numéro » pour le SQL analytique.
CREATE VIEW "core"."v_draw_numbers" AS
SELECT d.id           AS draw_id,
       d.game_id,
       d.draw_type_id,
       d.draw_date,
       d.status,
       s.set_type_id,
       t.code         AS set_code,
       n.number,
       n.ordinality   AS position
FROM "core"."draws" d
JOIN "core"."draw_number_sets" s ON s.draw_id = d.id
JOIN "core"."game_number_set_types" t ON t.id = s.set_type_id
CROSS JOIN LATERAL unnest(s.numbers) WITH ORDINALITY AS n(number, ordinality);
