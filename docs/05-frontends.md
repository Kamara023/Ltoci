# 05 — Frontends : web (MVP), backoffice, mobile

## 1. Application web (Next.js) — cœur du MVP

**Stack** : Next.js 15 (App Router), TypeScript, Tailwind CSS + shadcn/ui, Recharts, TanStack Query (cache client + revalidation), next-intl (fr par défaut). Pages publiques en SSR/ISR (SEO sur les résultats), espace connecté en client-side avec l'API.

### Plan des pages

| Route | Contenu | Accès |
|---|---|---|
| `/` | dernier tirage par type, tirages du jour, stats phares, CTA inscription | public |
| `/resultats` | historique paginé + filtres (type de tirage, période) | public (profondeur limitée) |
| `/resultats/[date]/[tirage]` | détail d'un tirage : gagnants + machine, source, stats contextuelles | public |
| `/statistiques` | hub : fréquences (barres 1–90), chaud/froid, retards, sommes/formes — sélecteur de fenêtre + ensemble (gagnants/machine) | mixte selon plan |
| `/statistiques/paires` | matrice/top des paires + lift | PREMIUM |
| `/combinaisons` | combinaisons candidates par stratégie, score + décomposition + explication, comparateur de stratégies | FREE limité / PREMIUM |
| `/backtesting` | tableau comparatif stratégies vs random, distribution des matches, filtre période | PREMIUM |
| `/analyses` | dernières analyses + textes AI Analyst | PREMIUM |
| `/compte`, `/abonnement` | profil, plan, upgrade, historique paiements | connecté |
| `/methodologie` | page publique : comment sont calculés les scores, limites statistiques, jeu responsable | public |

### Composants clés (`packages/ui`)

`NumberBall` (numéro avec variantes chaud/froid/retard), `DrawCard`, `FrequencyBarChart`, `TrendLineChart`, `PairsHeatmap`, `ShapeHistogram`, `StrategyCompareTable`, `CombinationCard` (numéros + score décomposé + explication), `WindowSelector`, `SetTypeToggle` (gagnants/machine), `DisclaimerBanner` (obligatoire sur pages stats/combinaisons).

### Règles UX

- Le bandeau « analyse statistique ≠ prédiction » est permanent sur `/combinaisons` et `/statistiques`.
- Chaque graphique précise la fenêtre et l'ensemble analysés + horodatage du calcul (`computed_at`).
- Mode sombre/clair ; responsive mobile-first (le web servira aussi de web-app mobile en attendant l'app native).

## 2. Backoffice admin (Next.js, app séparée `apps/admin`)

Application distincte (surface d'attaque réduite, déploiement séparé), mutualisant `packages/ui` et `packages/types`.

**Modules** : tableau de bord système (fraîcheur des données, statut collecteurs, jobs) · gestion des jeux et types de tirage · gestion des tirages (saisie manuelle, correction auditée, workflow `PENDING_REVIEW → VALID/INVALID`) · imports fichiers avec prévisualisation et rapport · surveillance ingestion (runs, événements, erreurs, relance) · file de revue qualité · gestion stratégies (activation, coefficients de score, plan minimum) et modèles (versions, métriques) · lancement/consultation des backtests · gestion utilisateurs & abonnements · consultation `audit_logs` · configuration des paramètres statistiques (fenêtres, seuils).

Accès : rôle `ADMIN`/`SUPERADMIN`, MFA TOTP recommandé dès la mise en prod, toutes mutations auditées.

## 3. Application mobile (React Native + Expo) — post-MVP

**Stack** : Expo (SDK courant à la date de la phase), TypeScript, Expo Router, TanStack Query, notifications push Expo. Réutilise `packages/types` (DTO) ; les composants UI sont adaptés (pas de partage direct avec le web, mais mêmes design tokens).

**Écrans** : Dashboard · Derniers résultats · Historique · Statistiques (fréquences, chaud/froid, retards) · Graphiques · Combinaisons candidates + détail (score décomposé, explication) · Notifications (nouveau tirage, nouvelle analyse, nouvelles candidates) · Profil · Abonnement (achat in-app ou redirection web selon les règles des stores).

**Contraintes stores** : Apple et Google encadrent strictement les apps liées aux jeux d'argent (catégorisation, pays, disclaimers, parfois compte développeur organisation). L'app ne permet **pas de jouer** (pas de mise, pas d'achat de ticket) — elle est informationnelle/analytique, ce qui simplifie la conformité, mais la revue store reste un risque planifié (cf. [08-risques-limites.md](08-risques-limites.md)).

**Push** : Expo Push + `app.push_tokens` ; déclencheurs : nouveau résultat, nouvelle analyse, nouvelles candidates, anomalie (admin).
