-- L'ORDRE DE SORTIE des numéros publié par la source est une information
-- métier (PHASE 11) : le trigger d'intégrité conserve TOUTES ses
-- vérifications (cardinalité, bornes, doublons) mais ne normalise PLUS par
-- tri croissant — draw_number_sets.numbers porte désormais l'ordre publié.
-- Les analyses restent ensemblistes (loader ML : sorted(set())) ; la vue
-- core.v_draw_numbers expose `position` = vrai rang de sortie.

CREATE OR REPLACE FUNCTION "core".check_draw_number_set() RETURNS trigger AS $$
DECLARE
    cfg "core"."game_number_set_types"%ROWTYPE;
    distinct_count int;
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

    SELECT count(DISTINCT n) INTO distinct_count FROM unnest(NEW.numbers) AS n;
    IF distinct_count <> array_length(NEW.numbers, 1) THEN
        RAISE EXCEPTION 'DUP_IN_SET: numeros dupliques dans l''ensemble';
    END IF;

    -- Plus de normalisation par tri : l'ordre publié est préservé tel quel.
    RETURN NEW;
END
$$ LANGUAGE plpgsql;
