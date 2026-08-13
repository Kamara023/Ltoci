# LotoStats CI — Plateforme d'analyse statistique du Loto Bonheur (LONACI)

Plateforme DATA + ANALYTICS + AI d'**analyse statistique**, de **modélisation** et de **génération de combinaisons candidates** pour les jeux de loterie en Côte d'Ivoire, à commencer par le **Loto Bonheur** (5 numéros parmi 1–90, ensembles « gagnants » et « machine », plusieurs tirages nommés par jour).

> ⚠️ **Avertissement**
> Les tirages de loterie sont des événements **aléatoires et indépendants**. Cette plateforme ne prédit pas les résultats futurs et n'augmente pas les chances de gagner : chaque combinaison possible a la même probabilité à chaque tirage. Les scores affichés sont des **indicateurs statistiques descriptifs**, jamais des probabilités de gain. Toutes les stratégies sont comparées publiquement à une sélection aléatoire par backtesting.
> Le jeu comporte des risques : endettement, isolement, dépendance. Jouez de manière responsable.

## Dossier de conception

| Document | Contenu |
|---|---|
| [docs/00-vision.md](docs/00-vision.md) | Vision produit, positionnement, posture éthique, personas |
| [docs/01-architecture.md](docs/01-architecture.md) | Architecture technique, stack & versions, arborescence monorepo, observabilité |
| [docs/02-modele-donnees.md](docs/02-modele-donnees.md) | Modèle de données & schéma PostgreSQL complet (5 schémas, justifications) |
| [docs/03-pipeline-data-ml.md](docs/03-pipeline-data-ml.md) | Pipeline ingestion → qualité → statistiques → features → stratégies → backtesting → AI Analyst |
| [docs/04-api.md](docs/04-api.md) | Contrat API REST v1 (public + admin), auth, quotas, gating par plan |
| [docs/05-frontends.md](docs/05-frontends.md) | Web Next.js (MVP), backoffice admin, mobile React Native |
| [docs/06-saas-securite.md](docs/06-saas-securite.md) | Plans FREE/PREMIUM/PRO, entitlements, sécurité |
| [docs/07-roadmap.md](docs/07-roadmap.md) | Roadmap en 15 phases (web-first) avec commandes et critères de validation |
| [docs/08-risques-limites.md](docs/08-risques-limites.md) | Limites statistiques, risques techniques, recommandations |
| [docs/09-mvp.md](docs/09-mvp.md) | Périmètre MVP précis (phases 1–8) et post-MVP |

## Résumé technique

- **Monorepo** pnpm + Turborepo : `apps/` (web, admin, mobile) · `services/` (api NestJS, ml FastAPI, ingestion Python) · `packages/` (types, ui, config) · `infrastructure/` (docker, nginx, monitoring).
- **Stack** : Node.js 22 / NestJS 11 / Prisma 6 · Python 3.12 / FastAPI · PostgreSQL 17 · Redis 7.4 / BullMQ · Next.js 15 · React Native + Expo · Docker Compose · Prometheus + Grafana · GitHub Actions.
- **Principes** : PostgreSQL unique source de vérité ; calculs asynchrones (jobs), lectures matérialisées + cache ; multi-jeux par configuration ; traçabilité et validation de chaque donnée ; zéro fuite temporelle dans les backtests.

## Démarrage rapide (dev)

Prérequis : Node.js ≥ 22, pnpm 11 (`npm i -g pnpm`), Python 3.12, Docker Desktop.

```powershell
# 1. Environnement
Copy-Item .env.example .env          # adapter si besoin

# 2. Infrastructure (PostgreSQL sur le port hôte 5433, Redis sur 6380)
docker compose -f infrastructure/docker/docker-compose.dev.yml --env-file .env up -d

# 3. Dépendances Node + base de données
pnpm install
cd services/api
pnpm exec prisma migrate deploy      # applique les migrations
pnpm exec prisma generate
pnpm exec prisma db seed             # référentiel : jeu, plans, stratégies…
pnpm run dev                         # API sur http://localhost:3001 (Swagger: /api/docs)

# 4. Service ML (autre terminal)
cd services/ml
py -3.12 -m venv .venv ; .\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000   # health: /internal/health (token requis)

# NB (front en mode production) : toujours ARRÊTER `next start` avant de
# relancer `next build` — reconstruire sous un serveur en marche fait
# servir un HTML qui référence des chunks supprimés (JS 404, pages inertes).
# En développement, préférer simplement `pnpm run dev`.

# 5. Qualité
pnpm turbo lint build test           # racine — lint + build + tests Node
pytest -q                            # depuis services/ml
```

## Statut

**PHASE 1 terminée** (fondations : monorepo, Docker dev, schéma PostgreSQL migré + seedé, health checks API/ML, CI) — en attente de validation avant la PHASE 2 (collecte & ingestion).
