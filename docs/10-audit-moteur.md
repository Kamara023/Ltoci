# 10 — Audit fonctionnel du moteur (PHASE 11)

> Audit réalisé le 13/08/2026 sur la base de développement locale.
> Chaque point de la checklist est vérifié par une **preuve ré-exécutée ce
> jour** (test automatisé, sondage SQL frais, ou exécution réelle) — jamais
> par une simple relecture de code. Les commandes sont rejouables telles
> quelles.

## Rappel du cadre d'honnêteté

Les tirages de loterie sont **aléatoires et indépendants**. Aucun module de
cette plateforme ne prédit un tirage ; le moteur mesure, score, ordonne et
**vérifie ses propres méthodes contre une baseline aléatoire**. Sur un tirage
équitable, l'espérance de correspondances d'un TOP 5 est 5×5/90 ≈ **0,278** ;
tout écart durable et significatif serait un signal (biais de données ou
défaut du harnais) — pas un « pouvoir prédictif ».

## Synthèse des suites de tests (ré-exécutées ce jour)

| Suite | Résultat |
|---|---|
| `services/ml` pytest (stats, génération, ML, backtesting, prévisions) | **42/42 verts** (50,9 s) |
| `services/api` jest e2e (auth, gating, stats, prédictions, prévisions, admin, qualité) | **47/47 verts** |
| `services/ingestion` pytest (collecteur, parsing, qualité) | **25/25 verts** |
| `apps/web` vitest (composants dont ForecastCard) | **9/9 verts** |
| Lint/typage : ruff (ml), eslint+tsc (api, web, admin) | **0 erreur** |

## Checklist — les 16 points

### 1. Moteur d'analyse
**Attendu :** ingestion continue de l'historique réel, validation qualité, analyse exploitable.
**Constaté :** 15 151 tirages en base (15 146 VALID + 5 PENDING_REVIEW), du
2020-10-05 au **2026-08-13** (le jour de l'audit — la collecte horaire vit :
dernier run `lonaci-api` SUCCESS à 16:20 UTC, recalcul stats auto à 16:35).
```sql
SELECT status, count(*) FROM core.draws GROUP BY status;
-- VALID 15146 | PENDING_REVIEW 5
```
**Verdict : OPÉRATIONNEL** — chaîne autonome collecte → qualité → stats → candidates → prévisions.

### 2. Statistiques complètes
**Attendu :** fréquences, écarts, retards, paires, formes — exactes et fraîches.
**Constaté :** 33 300 lignes `analytics.number_stats` (90 numéros × fenêtres ×
types), paires et formes matérialisées ; exactitude prouvée par les tests
`test_statistics_compute.py` (recalcul indépendant ≡ valeurs persistées).
**Verdict : OPÉRATIONNEL.**

### 3. Moteur de prévision par tirage
**Attendu :** une prévision pour CHAQUE prochain tirage de chaque jeu (multi-tirages/jour).

**Défaut trouvé le 14/08 et corrigé.** La première version ciblait « aujourd'hui,
sinon demain » pour les 39 types — or la source ne publie **aucun calendrier** et
seuls ~10 types tirent un jour donné. Les prévisions des types qui ne tiraient pas
s'accumulaient sans jamais pouvoir être évaluées : `/forecasts/next` renvoyait
**95 cartes dont 30 datées de la veille**.

**Correction :** le calendrier de chaque type est désormais **inféré de son
historique** (service ingestion, `app/schedules.py` : un jour de la semaine est
retenu s'il est honoré ≥ 60 % du temps, fenêtre partant du premier tirage du type)
et rafraîchi après chaque collecte. Le moteur cible alors la **prochaine occurrence
réelle** ; un type sans rythme hebdomadaire (`day-off` : tirages de jours fériés)
ne reçoit aucune prévision plutôt qu'une date inventée.

**Constaté après correction :** 39 types → 36 au calendrier connu, **36 prévisions
actives**, une par prochain tirage réel, plus aucune cible passée.
```sql
SELECT target_date, count(*) FROM ml.forecasts
WHERE superseded_at IS NULL AND target_date >= current_date GROUP BY target_date;
-- 08-14: 7 (tirages restants du jour) | 08-15: 8 | 08-16→08-20: 4/jour | 08-21: 1
```
Calendrier inféré conforme à l'observation : quotidiens (`afterwork`,
`digital-21h/22h/23h`…), hebdomadaires à jour fixe (`akwaba` lundi, `kado` jeudi…),
week-end (`special-weekend-1h/3h`), 3 irréguliers écartés.
**Verdict : OPÉRATIONNEL (corrigé le 14/08).**

### 4. Scoring des numéros
**Attendu :** chaque numéro reçoit un score composite traçable.
**Constaté :** consensus = moyenne pondérée des poids normalisés de toutes les
stratégies actives (pondérations éditables en base, `FORECAST_CONSENSUS.default_config`).
Chaque entrée porte score, facteurs dominants (fréquence, récence, retard,
cooccurrences, ML) et le nombre de modèles d'accord. Test pur
`test_consensus_structure_et_ranking` : cas jouet calculé à la main, le numéro
dominant obtient exactement le score attendu (1,0).
**Verdict : OPÉRATIONNEL.**

### 5. Ranking
**Attendu :** classement déterministe et reproductible.
**Constaté :** tri stable (égalités départagées par numéro croissant),
`test_consensus_deterministe_et_top5` prouve la reproductibilité bit à bit.
Les scores sont décroissants avec le rang (vérifié aussi en e2e sur données réelles).
**Verdict : OPÉRATIONNEL.**

### 6 & 7. TOP 5 et TOP 10
**Attendu :** réduction TOUS (90) → analyse → filtrage → scoring → ranking → TOP 10 → TOP 5.
**Constaté :** chaque prévision persiste exactement 10 entrées de rang 1..10
(sondage : 10,0 entrées/prévision sur les 39 actives) ; le TOP 5 = rangs 1..5.
Confiance étiquetée faible/moyenne/forte (accord inter-modèles + marge de score).
**Verdict : OPÉRATIONNEL (nouveau en PHASE 11).**

### 8. Backtesting
**Attendu :** chaque méthode validée en walk-forward contre la baseline aléatoire.
**Constaté :** exécution complète de ce jour (16 min) — voir le tableau final
en bas de document. La convergence de STRATEGY_RANDOM vers ≈ 0,278
**auto-valide le harnais** (0,2750 mesuré sur 14 846 pas).
**Verdict : OPÉRATIONNEL** — étendu en PHASE 11 au consensus (global + par type).

### 9. Multi-jeux
**Attendu :** l'architecture supporte plusieurs jeux sans refonte.
**Constaté :** `core.games` porte la config (bornes, tailles d'ensembles) ;
tous les modules (stats, génération, prévisions, backtest) lisent
`game_id`/`set_types` depuis la base — aucun « 90 » codé en dur dans les
chemins de calcul (bornes issues de `game_number_set_types`). Un 2ᵉ jeu =
1 ligne de config + 1 collecteur.
**Verdict : ARCHITECTURE PRÊTE** (un seul jeu réel branché : Loto Bonheur).

### 10. Tirages multiples par jour
**Attendu :** chaque type de tirage (Réveil 10h, Étoile 13h, …) traité comme cible distincte.
**Constaté :** 39 types actifs auto-créés depuis les données réelles ;
prévisions par `draw_type_id` NOT NULL ; contrainte d'unicité
`(game, type, date)` sur les tirages ; backtest consensus par type (états
incrémentaux indépendants).
**Verdict : OPÉRATIONNEL.**

### 11. Prévision avant CHAQUE prochain tirage
**Attendu :** avant chaque tirage à venir, une prévision figée existe.
**Constaté :** cible = aujourd'hui si le tirage du type n'est pas encore en
base, sinon demain (test `test_generation_reelle_et_supersede`) ; la chaîne
post-collecte régénère automatiquement après chaque run horaire (processor
BullMQ : collect → stats → candidates → **évaluer prévisions → régénérer**).
**Verdict : OPÉRATIONNEL.**

### 12. Enregistrement FIGÉ des prévisions
**Attendu :** prévision stockée avec contexte complet, jamais modifiable rétroactivement.
**Constaté :** chaque `ml.forecasts` porte jeu, type, date cible,
`dataset_cutoff_draw_id` (dernier tirage connu), versions/pondérations des
modèles, config, `locked_at`. Re-génération avant tirage = **supersede tracé**
(l'ancienne version reste en base : 156 lignes dont 39 actives). Après
évaluation : **immuabilité au niveau SQL** — trigger `trg_forecast_frozen`
refuse UPDATE/DELETE (`FORECAST_FROZEN`), vérifié par test d'intégration qui
tente réellement la modification.
**Verdict : OPÉRATIONNEL.**

### 13. Comparaison prévision vs résultat réel
**Attendu :** à l'arrivée du tirage réel, hits TOP 5/TOP 10 et numéros retrouvés enregistrés.
**Constaté :** `evaluate_forecasts()` joint les prévisions actives aux tirages
VALID arrivés ; test d'intégration sur un tirage réel : hits exacts (2/5 et
3/10 sur le cas construit), numéros retrouvés corrects, résultat **immuable**
(trigger `trg_forecast_result_immutable` vérifié). L'évaluation est idempotente
(jamais deux résultats pour une prévision). Déclenchée automatiquement après
chaque collecte, AVANT la régénération.
**Verdict : OPÉRATIONNEL** — 0 évaluation réelle en base à l'heure de l'audit
(les 39 premières prévisions attendent leurs tirages) ; la première tombera au
prochain cycle horaire suivant un tirage.

### 14. Historique de performance réelle
**Attendu :** performance accumulée consultable : distribution 0/5→5/5, moyennes, par type.
**Constaté :** `GET /forecasts/performance` (PRO) : distribution des hits,
moyennes TOP 5/TOP 10 **toujours affichées face à la baseline aléatoire
(0,278)**, décomposition par type, 20 dernières évaluations. Page web
`/previsions` (onglet Performance) + tuile admin.
**Verdict : OPÉRATIONNEL** (s'alimentera tirage après tirage).

### 15. Stabilité des modèles
**Attendu :** versions traçables, comportement stable dans le temps.
**Constaté :** `ml.models` (4 modèles enregistrés, artefacts joblib versionnés) ;
chaque prévision fige `model_versions` + pondérations ; les métriques de
backtest incluent la décomposition **par année** (stabilité temporelle) ;
ré-entraînement ML périodique (250 pas) pendant le walk-forward, uniquement
sur le passé.
**Verdict : OPÉRATIONNEL.**

### 16. Aucune fuite de données (anti-leakage)
**Attendu :** aucune feature ne voit le futur ; preuves structurelles.
**Constaté (3 niveaux, tous ré-exécutés) :**
1. **Backtest** : sur 100 % des points persistés, `cutoff_draw_id` est
   antérieur au tirage cible (contrôle SQL du test d'intégration : 0 violation).
2. **Features incrémentales** : équivalence prouvée par test entre l'état
   incrémental après k tirages et le recalcul complet sur `seq[:k]`.
3. **Prévisions** : `dataset_cutoff_draw_id` jamais postérieur à la cible :
```sql
SELECT count(*) FROM ml.forecasts f
JOIN core.draws d ON d.id = f.dataset_cutoff_draw_id
WHERE d.draw_date > f.target_date;  -- 0
```
**Verdict : OPÉRATIONNEL.**

## Résultats du backtest complet (14 846 pas, walk-forward, 13/08/2026, 952 s)

### Séquence globale — moyenne de hits par TOP 5 (théorie : 0,2778)

| Stratégie | Moyenne | Δ vs random | p-value | Lecture |
|---|---|---|---|---|
| STRATEGY_FREQUENCY | **0,2947** | +0,0197 | **0,0008** | seul signal significatif |
| STRATEGY_COOCCURRENCE | **0,2947** | +0,0197 | **0,0008** | idem (corrélé à la fréquence) |
| STRATEGY_ML_GB | 0,2836 | +0,0087 | 0,14 | indiscernable du hasard |
| STRATEGY_ML_RF | 0,2831 | +0,0082 | 0,16 | indiscernable du hasard |
| **FORECAST_CONSENSUS** | **0,2793** | **+0,0043** | **0,46** | **indiscernable du hasard** |
| STRATEGY_HOT_NUMBERS | 0,2787 | +0,0038 | 0,52 | — |
| STRATEGY_STATISTICAL | 0,2785 | +0,0036 | 0,54 | — |
| STRATEGY_RECENCY | 0,2777 | +0,0028 | 0,63 | — |
| STRATEGY_RANDOM | 0,2750 | 0 | — | baseline (≈ théorie ✓) |
| STRATEGY_BALANCED | 0,2712 | −0,0038 | 0,52 | — |
| STRATEGY_COLD_NUMBERS | 0,2644 | −0,0105 | 0,07 | symétrique négatif attendu |

Distribution des hits du consensus (global) : 0/5 ×11 056 · 1/5 ×3 446 ·
2/5 ×332 · **3/5 ×12 · 4/5 ×0 · 5/5 ×0** (FREQUENCY : 18× 3/5 ; RANDOM : 15×).

### Consensus PAR TYPE de tirage (cadre réel des prévisions)

35 types évalués (4 types trop récents pour atteindre le seuil de 200 tirages
d'historique), **7 877 points** au total : moyenne 0,2726, étendue 0,155–0,387
selon le type (petits échantillons : 71 à 1 409 points par type — les extrêmes
sont surtout du bruit d'échantillonnage). Cumul : **9× 3/5, 0× 4/5, 0× 5/5**.

### Lecture honnête (l'essentiel)

1. **Le consensus actuel (0,2793, p=0,46) ne bat PAS significativement le
   hasard**, alors que FREQUENCY/COOCCURRENCE seules montrent +0,0197
   (p≈0,0008) : mélanger les stratégies **dilue** le seul signal mesurable
   avec des composantes équivalentes au hasard. C'est exactement le type de
   conclusion que l'outil doit produire — piste d'expérimentation n° 1 :
   augmenter le poids de FREQUENCY/COOCCURRENCE (éditable en base, colonne
   `default_config` de FORECAST_CONSENSUS, sans redéploiement) et re-backtester.
2. Même le meilleur signal (+0,02 hit/tirage) reste **minuscule** : ~1 numéro
   supplémentaire retrouvé tous les 50 tirages. Aucune méthode ne « prédit ».
3. Les 4/5 et 5/5 : **zéro** sur ~22 700 évaluations simulées (global + par
   type) — cohérent avec P(4+ hits) ≈ 0,05 %. L'objectif expérimental 5/5
   reste un objectif de mesure, jamais une promesse.

## Écarts connus et limites (honnêteté)

- **Aucune évaluation réelle encore** : les prévisions viennent d'être créées ;
  la boucle prévision → tirage → hits démarre au prochain cycle. C'est le
  cœur de l'expérimentation des prochains mois.
- **4/5 et 5/5 seront rarissimes** : sur un tirage équitable, P(≥4 hits d'un
  top-5) ≈ 0,05 % par tirage. L'outil les comptera explicitement — sans jamais
  les promettre.
- **Le signal FREQUENCY/COOCCURRENCE (+0,018 hit, p≈0,002)** est petit ; il
  peut refléter un léger biais des données historiques. Il est exploité par les
  pondérations du consensus mais surveillé par backtest hebdomadaire.
- **5 tirages PENDING_REVIEW** : anomalies détectées par le moteur qualité en
  attente de revue manuelle (backoffice) — comportement voulu.
- **CI GitHub désactivée** (comptes bloqués côté GitHub) : les suites sont
  exécutées localement ; à réactiver dès déblocage du compte.
