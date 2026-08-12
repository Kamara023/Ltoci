# 04 — Architecture API

## 1. Principes

- **REST versionnée** : préfixe `/api/v1`. Documentation OpenAPI 3.1 générée par NestJS (`@nestjs/swagger`), exposée sur `/api/docs` (protégée en prod).
- **Lecture rapide** : l'API sert des résultats matérialisés (`analytics.*`, `ml.*`) + cache Redis (TTL invalidé à chaque tirage validé). Aucun calcul lourd dans le cycle requête/réponse.
- **Écriture asynchrone** : `POST /analysis/run`, `POST /backtests/run` créent un job et répondent `202 Accepted` avec une ressource de suivi (`/jobs/:id`).
- **Auth** : JWT access (15 min) + refresh token rotatif (30 j, stocké hashé, révocable). Plan PRO : API keys (`Authorization: Bearer` ou `X-Api-Key`).
- **Quotas par plan** : rate limiting Redis (fenêtre glissante) piloté par `plans.entitlements.rate_limit_per_min` ; en-têtes `X-RateLimit-*` renvoyés.
- **Format d'erreur unifié** :
  ```json
  { "error": { "code": "DRAW_NOT_FOUND", "message": "…", "requestId": "…" } }
  ```
- **Pagination** standard : `?page=&limit=` + enveloppe `{ data, meta: { page, limit, total } }` ; filtres communs : `gameId`, `drawTypeId`, `setType` (`WINNING`|`MACHINE`), `window` (`ALL`|`LAST_100`|…|`from&to`).

## 2. Endpoints v1

### Public / authentifié (selon plan)

| Méthode | Route | Description | Plan min |
|---|---|---|---|
| POST | `/auth/register` · `/auth/login` · `/auth/refresh` · `/auth/logout` | cycle de vie auth | — |
| GET | `/games` · `/games/:id` | jeux et leurs règles (plage, ensembles, types de tirage) | FREE |
| GET | `/draws` | historique paginé + filtres (profondeur limitée par plan) | FREE |
| GET | `/draws/latest` | derniers tirages par type | FREE |
| GET | `/draws/:id` | détail d'un tirage (les 2 ensembles, source, statut) | FREE |
| GET | `/statistics/frequencies` | fréquences par numéro (+ évolution) | FREE (fenêtres limitées) |
| GET | `/statistics/hot` · `/statistics/cold` | classements chaud/froid + avertissement pédagogique dans la réponse | FREE |
| GET | `/statistics/delays` | retards actuels/moyens/max + distribution | PREMIUM |
| GET | `/statistics/pairs` | paires fréquentes + lift (triplets via `?size=3`, top-N) | PREMIUM |
| GET | `/statistics/shapes` | sommes, pair/impair, haut/bas, consécutifs, dispersion, répétitions | PREMIUM |
| GET | `/statistics/trends` | évolutions de fréquence par fenêtre | PREMIUM |
| GET | `/analysis/latest` | dernière analyse complète (+ texte AI Analyst si plan) | FREE (résumé) / PREMIUM |
| POST | `/analysis/run` | recalcul à la demande → `202` + job | PRO |
| GET | `/predictions` | lots de combinaisons candidates (filtre stratégie/date) | FREE (1 stratégie) / PREMIUM |
| GET | `/predictions/:id` | détail : combinaisons, scores, `score_breakdown`, explications | idem |
| GET | `/strategies` | stratégies disponibles + description honnête de chacune | FREE |
| GET | `/backtests` · `/backtests/:id` | résultats de backtests (métriques vs random) | PREMIUM |
| POST | `/backtests/run` | lancer un backtest paramétré → `202` + job | PRO |
| GET | `/jobs/:id` | statut d'un job asynchrone | selon déclencheur |
| GET | `/notifications` · PATCH `/notifications/:id/read` | centre de notifications | FREE |
| GET | `/me` · PATCH `/me` · GET `/me/subscription` | profil & abonnement | FREE |
| GET | `/exports/draws.csv` | export CSV/JSON de l'historique | PRO |

### Admin (`/api/v1/admin`, rôle ADMIN+, audité)

| Méthode | Route | Description |
|---|---|---|
| CRUD | `/admin/games`, `/admin/draw-types` | référentiel jeux/tirages |
| POST | `/admin/draws` · PATCH `/admin/draws/:id` | saisie manuelle, correction (→ `audit_logs`) |
| POST | `/admin/draws/:id/validate` · `/invalidate` | workflow de validation |
| POST | `/admin/imports` (multipart) | import CSV/Excel/JSON + rapport |
| GET | `/admin/ingestion/runs` · `/runs/:id/events` | surveillance collecte + logs |
| POST | `/admin/ingestion/collect` | déclencher une collecte manuelle |
| GET | `/admin/quality/issues` · POST `/issues/:id/resolve` | file de revue qualité |
| CRUD | `/admin/strategies` (activation, coefficients) · `/admin/models` | gestion ML |
| CRUD | `/admin/users` · `/admin/subscriptions` · `/admin/plans` | gestion SaaS |
| GET | `/admin/system/stats` · `/admin/jobs` | santé système, historique jobs |

## 3. Garde-fous transverses

- **Gating par plan** : décorateur `@RequireEntitlement('backtesting')` sur les routes ; le guard lit les entitlements du plan actif de l'utilisateur (cache Redis). Les fenêtres/profondeurs d'historique sont bornées côté serveur selon le plan — jamais côté client seulement.
- **Validation d'entrée** systématique (class-validator + DTO typés partagés via `packages/types`).
- **Disclaimer structurel** : les réponses `/predictions*` et `/statistics/hot|cold` embarquent un champ `disclaimer` non désactivable.
- **Audit** : toute mutation admin écrit dans `ops.audit_logs` (before/after).
- **Idempotence** : `POST /backtests/run` et `/analysis/run` acceptent un header `Idempotency-Key`.
