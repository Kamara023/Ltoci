# 09 — Définition du MVP & post-MVP

## 1. MVP (phases 1 → 8)

**Énoncé** : une application **web** qui affiche les résultats fiables du Loto Bonheur, des statistiques riches et honnêtes, des combinaisons candidates expliquées, et la preuve par backtesting de ce que valent (ou non) les stratégies.

### Inclus

**Données**
- Jeu Loto Bonheur configuré (5/90, ensembles gagnants + machine, tirages quotidiens nommés confirmés avec la source).
- Ingestion 3 canaux : saisie manuelle admin, imports CSV/Excel/JSON, collecteur web d'une source publique (dans le respect des CGU) + backfill de l'historique disponible.
- Pipeline qualité complet (statuts `VALID/INVALID/PENDING_REVIEW`, règles, journalisation, mode dégradé).

**Analyse**
- Analyses A→K matérialisées, par ensemble et par type de tirage, fenêtres `ALL/100/50/20/10/personnalisée`.
- 8 stratégies interprétables (dont la baseline `STRATEGY_RANDOM`) + moteur de combinaisons avec `score_breakdown` et explication (AI Analyst v1 à gabarits déterministes).
- **Backtesting walk-forward** complet avec comparaison à la baseline aléatoire.

**Produit**
- API REST v1 documentée (auth JWT + refresh, cache, rate limiting de base).
- Web Next.js : accueil, résultats, statistiques, combinaisons, backtesting, méthodologie, compte.
- Endpoints admin minimaux (saisie, import, validation qualité) — consommés via Swagger en attendant le backoffice.
- Docker Compose dev + déploiement staging simple ; CI lint + tests.
- Disclaimers et page méthodologie dès le premier écran public.

### Explicitement exclu du MVP
Application mobile · backoffice UI complet · paiements/abonnements (les plans existent en base, tout le monde est FREE ou testeur PREMIUM) · notifications push/email · ML (RF/GB/XGBoost) · API publique PRO/exports · monitoring Prometheus/Grafana complet (logs structurés seulement) · LLM pour l'AI Analyst · multi-jeux effectif.

### Critère de succès du MVP
Un utilisateur non technique peut : consulter le dernier tirage < 1 h après sa publication, explorer les fréquences/retards sur la fenêtre de son choix, obtenir 10 combinaisons candidates expliquées, et vérifier lui-même dans l'onglet backtesting comment chaque stratégie se compare au hasard.

## 2. Post-MVP (ordre indicatif = phases 9 → 15)

1. **ML expérimental** (RF, GB, XGBoost) intégré au backtesting public.
2. **Backoffice admin** complet.
3. **Application mobile** React Native + Expo.
4. **Notifications** (push, email, préférences).
5. **SaaS** : paiements Mobile Money (CinetPay/Paystack), gating complet FREE/PREMIUM/PRO.
6. **Monitoring production** (Prometheus/Grafana, alertes, sauvegardes testées).
7. **API publique PRO** + exports.
8. **AI Analyst LLM** (Claude API) pour les synthèses rédigées.
9. **Multi-jeux** : 2e jeu LONACI par configuration, puis autres loteries de la sous-région.
10. Améliorations continues : PWA/notifications web, comparateur de grilles personnelles (« ma grille vs l'historique »), espace pédagogique probabilités.
