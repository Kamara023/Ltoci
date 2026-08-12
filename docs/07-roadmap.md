# 07 — Roadmap (15 phases, réordonnée web-first)

> Réordonnancement validé : le **web** précède le mobile ; l'API précède les fronts ; le backtesting arrive dès que les premières stratégies existent. **MVP = phases 1 → 8.** Chaque phase se termine par une validation explicite avant la suivante.

## Prérequis outillage (une fois)

| Outil | Version | Vérification |
|---|---|---|
| Node.js | 22 LTS | `node -v` |
| pnpm | 9+ | `corepack enable && pnpm -v` |
| Python | 3.12 | `py -3.12 --version` |
| Docker Desktop (WSL2) | courant | `docker compose version` |
| Git | courant | `git -v` |

PostgreSQL 17 et Redis 7.4 tournent **en conteneurs** (pas d'installation locale).

---

## PHASE 1 — Fondations : monorepo + base de données

**Objectif** : squelette du monorepo, environnement Docker dev, schéma DB migré et seedé.

**Tâches & commandes** :
```bash
git init lotostats && cd lotostats
corepack enable && pnpm init
# pnpm-workspace.yaml : apps/*, services/*, packages/*
pnpm add -D turbo -w

# API NestJS
pnpm dlx @nestjs/cli new services/api --package-manager pnpm
cd services/api && pnpm add prisma @prisma/client && pnpm dlx prisma init

# Service ML (Python)
cd ../../services && mkdir ml && cd ml
py -3.12 -m venv .venv && .venv\Scripts\activate
pip install fastapi "uvicorn[standard]" sqlalchemy psycopg[binary] pydantic-settings structlog
pip freeze > requirements.txt

# Infra dev
# infrastructure/docker/docker-compose.dev.yml : postgres:17, redis:7.4, api, ml
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d postgres redis
cd services/api && pnpm dlx prisma migrate dev --name init
pnpm dlx prisma db seed   # jeu loto-bonheur, set types, draw types, plans, stratégies, fenêtres
```

**Fichiers clés** : `pnpm-workspace.yaml`, `turbo.json`, `services/api/prisma/schema.prisma` (tout le schéma de [02-modele-donnees.md](02-modele-donnees.md)), `prisma/seed.ts`, `docker-compose.dev.yml`, `.env.example`, `packages/types` (enums partagés), `packages/config` (eslint/tsconfig).

**Validation** : `docker compose up` démarre PG+Redis+API+ML ; `GET /api/v1/health` et `GET /internal/health` répondent ; le seed est visible en base ; CI GitHub Actions verte (lint + tests vides).
**Tests** : test de conformité du schéma (Prisma ↔ SQL attendu), smoke tests santé.

---

## PHASE 2 — Collecte & ingestion

**Objectif** : alimenter `core.draws` par les 3 canaux : saisie manuelle (API admin), imports fichiers, collecteur web.

**Tâches** : module `services/ingestion` (collectors/importers/normalizers) ; identification de la source publique de résultats et de ses CGU ; confirmation de la **liste réelle des tirages quotidiens** (mise à jour du seed `draw_types`) ; endpoints admin `POST /admin/draws`, `POST /admin/imports` ; jobs BullMQ `collect-draws` (cron post-tirage + rattrapage quotidien) ; backfill de l'historique disponible ; `ingestion_runs` + `ingestion_events`.

**Commandes** : `pip install httpx beautifulsoup4 lxml openpyxl pandas tenacity` ; `pnpm add bullmq ioredis` (api).

**Validation** : un tirage saisi à la main, un CSV importé avec rapport, une collecte web réussie ; relancer la même collecte ⇒ 0 doublon (upsert) ; couper la source ⇒ run `FAILED` + alerte, le reste fonctionne.
**Tests** : parseurs sur fixtures HTML/CSV/Excel (y compris fichiers malformés), idempotence de l'upsert, détection `FORMAT_CHANGE`.

---

## PHASE 3 — Nettoyage, validation & qualité

**Objectif** : pipeline qualité complet, statuts `VALID/INVALID/PENDING_REVIEW`, file de revue.

**Tâches** : implémentation des règles de [03-pipeline-data-ml.md](03-pipeline-data-ml.md) §3 ; trigger d'intégrité des `draw_number_sets` ; endpoints admin qualité ; normalisation (tri, fuseau `Africa/Abidjan`).

**Validation** : injection de fixtures corrompues ⇒ chaque règle produit l'issue et le statut attendus ; seuls les tirages `VALID` sont exposés aux stats.
**Tests** : une suite par règle de qualité, test du trigger SQL.

---

## PHASE 4 — Statistiques

**Objectif** : analyses A→K matérialisées dans `analytics.*`, recalcul automatique.

**Tâches** : modules `statistics/` du service ML (un module par analyse) ; job `refresh-statistics` déclenché à chaque tirage validé ; fenêtres `ALL/LAST_100/LAST_50/LAST_20/LAST_10/personnalisée` ; endpoints internes ML.

**Commandes** : `pip install numpy pandas scipy`.

**Validation** : sur un jeu de données de test contrôlé (résultats attendus calculés à la main), chaque statistique est exacte ; recalcul < 30 s ; les stats distinguent gagnants/machine et par type de tirage.
**Tests** : tests unitaires par analyse avec valeurs attendues, test de non-régression sur snapshot.

---

## PHASE 5 — API REST publique

**Objectif** : exposer draws + statistics via l'API NestJS documentée, avec auth et cache.

**Tâches** : modules auth (JWT + refresh rotatif), games, draws, statistics ; cache Redis + invalidation sur nouveau tirage ; rate limiting ; OpenAPI ; DTO partagés dans `packages/types`.

**Validation** : parcours complet via Swagger : register → login → consulter stats ; 401/403/429 corrects ; p95 < 100 ms sur les routes stats (cache chaud).
**Tests** : e2e API (supertest) sur auth + chaque famille de routes, tests des guards.

---

## PHASE 6 — Application web (dashboard)

**Objectif** : premier produit visible — résultats + statistiques.

**Commandes** : `pnpm dlx create-next-app@latest apps/web --ts --tailwind --app` ; `pnpm add @tanstack/react-query recharts` ; shadcn/ui.

**Tâches** : pages `/`, `/resultats`, `/statistiques`, `/methodologie` ; composants `packages/ui` ; `DisclaimerBanner` ; auth front ; responsive.

**Validation** : un visiteur consulte les derniers résultats et les fréquences sans lire la doc ; Lighthouse ≥ 90 (perf/accessibilité) ; disclaimers présents.
**Tests** : composants (Vitest + Testing Library), e2e Playwright sur les parcours clés.

---

## PHASE 7 — Moteur de scoring & stratégies simples

**Objectif** : génération de combinaisons candidates expliquées (stratégies interprétables).

**Tâches** : moteur `generation/` (pool → score → contraintes → diversité → top-N) ; stratégies RANDOM, FREQUENCY, HOT, COLD, RECENCY, BALANCED, COOCCURRENCE, STATISTICAL ; AI Analyst v1 (gabarits déterministes) ; job `generate-candidates` ; endpoints `/predictions*` ; page web `/combinaisons`.

**Validation** : chaque stratégie produit N candidates distinctes avec `score_breakdown` complet et explication lisible ; coefficients modifiables en config ; `dataset_cutoff_draw_id` correct.
**Tests** : une suite par stratégie (reproductibilité avec seed), contraintes respectées, diversité (Jaccard), interdits de formulation de l'Analyst.

---

## PHASE 8 — Backtesting  ⟶ **fin du MVP**

**Objectif** : évaluation walk-forward de toutes les stratégies vs baseline aléatoire.

**Tâches** : module `backtesting/` ; persistance `ml.backtests` + `backtest_points` ; métriques (moyenne, distribution, par période, p-value vs random) ; endpoints `/backtests*` ; page web `/backtesting`.

**Validation** : backtest complet de l'historique en < 10 min ; contrôle automatique `cutoff < target` sur 100 % des points ; la moyenne de STRATEGY_RANDOM converge vers ≈ 0,278 (validation du harnais lui-même).
**Tests** : test anti-leakage (injection d'un tirage futur ⇒ échec), tests des métriques sur petits cas calculés à la main.

---

## PHASE 9 — ML expérimental

**Objectif** : stratégies RF / Gradient Boosting (XGBoost si gain), entraînement versionné.

**Commandes** : `pip install scikit-learn xgboost joblib`.

**Tâches** : features §5 de [03-pipeline-data-ml.md](03-pipeline-data-ml.md) ; entraînement walk-forward (Time Series Split) ; registre `ml.models` ; intégration au backtesting ; affichage honnête des résultats vs random.

**Validation** : modèles reproductibles (seed), métriques persistées, comparaison publiée dans `/backtesting`.
**Tests** : anti-leakage features, reproductibilité, chargement d'artefacts.

---

## PHASE 10 — Backoffice admin

**Objectif** : `apps/admin` complet (cf. [05-frontends.md](05-frontends.md) §2).

**Validation** : un admin gère le cycle complet (revue qualité, correction auditée, import, relance de collecte, coefficients de stratégie) sans toucher à la base à la main.
**Tests** : e2e sur les workflows de validation/correction, vérification des `audit_logs`.

---

## PHASE 11 — Application mobile

**Objectif** : app React Native + Expo (écrans de [05-frontends.md](05-frontends.md) §3).

**Commandes** : `pnpm dlx create-expo-app@latest apps/mobile` ; EAS Build pour les binaires.

**Validation** : parcours complet sur Android et iOS ; préparation conformité stores.
**Tests** : composants + e2e Maestro/Detox sur parcours clés.

---

## PHASE 12 — Notifications

**Objectif** : centre de notifications + push Expo + email (nouveau tirage, analyse, candidates, anomalies, source indisponible, modèle recalculé).

**Validation** : chaque événement déclencheur produit la notification attendue, préférences par utilisateur respectées.

---

## PHASE 13 — SaaS / abonnements

**Objectif** : plans actifs, paiement Mobile Money (CinetPay/Paystack) + webhooks, gating par entitlements sur toute l'API et les fronts.

**Validation** : cycle complet upgrade → accès étendu → expiration → downgrade automatique ; réconciliation paiements ; factures/justificatifs.
**Tests** : guards d'entitlements exhaustifs, simulation de webhooks.

---

## PHASE 14 — Monitoring & production

**Objectif** : Prometheus + Grafana + alertes, Nginx + TLS, sauvegardes testées, CI/CD complet (staging auto, prod par tag).

**Validation** : dashboard « fraîcheur des données » opérationnel ; alerte déclenchée par une panne simulée de collecte ; restauration de sauvegarde testée ; déploiement sans interruption.

---

## PHASE 15 — Durcissement & ouverture

**Objectif** : audit sécurité (checklist [06-saas-securite.md](06-saas-securite.md)), tests de charge, API publique PRO (clés, quotas, docs), page méthodologie enrichie, préparation multi-jeux (2e jeu pilote pour valider la généricité).

**Validation** : un 2e jeu ajouté **uniquement par configuration** (lignes en base + collecteur dédié), sans modification de schéma ni des analyses.
