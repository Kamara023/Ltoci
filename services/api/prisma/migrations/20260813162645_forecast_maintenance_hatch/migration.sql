-- Échappatoire de MAINTENANCE explicite pour l'immuabilité des prévisions :
-- une session doit poser `SET LOCAL app.allow_forecast_maintenance = 'on'`
-- (transaction courante uniquement) pour pouvoir purger des données de test.
-- Aucune application ne pose cette variable en fonctionnement normal —
-- l'immuabilité reste la règle.

CREATE OR REPLACE FUNCTION "ml".forbid_forecast_mutation() RETURNS trigger AS $$
BEGIN
    IF current_setting('app.allow_forecast_maintenance', true) = 'on' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM "ml"."forecast_results" r WHERE r.forecast_id = OLD.id) THEN
        RAISE EXCEPTION 'FORECAST_FROZEN: prevision evaluee, modification interdite';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "ml".forbid_result_mutation() RETURNS trigger AS $$
BEGIN
    IF current_setting('app.allow_forecast_maintenance', true) = 'on' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'FORECAST_RESULT_IMMUTABLE: resultat de prevision immuable';
END $$ LANGUAGE plpgsql;
