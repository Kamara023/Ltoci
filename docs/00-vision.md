# 00 — Vision produit

## 1. Positionnement

**Nom de travail** : LotoStats CI (à affiner).

Plateforme d'**analyse statistique**, de **modélisation** et de **génération de combinaisons candidates** pour les jeux de loterie en Côte d'Ivoire, avec comme premier périmètre le **Loto Bonheur de la LONACI**.

Ce que le produit **est** :

- une plateforme DATA + ANALYTICS + AI : collecte, historisation, analyse et visualisation des tirages ;
- un outil d'exploration statistique honnête : fréquences, retards, cooccurrences, distributions ;
- un générateur de combinaisons candidates **expliquées**, chaque combinaison étant accompagnée de la décomposition de son score ;
- un banc d'essai objectif : chaque stratégie est mesurée par **backtesting** et comparée à une **baseline aléatoire**.

Ce que le produit **n'est pas** — et ne prétendra jamais être :

- un prédicteur de résultats futurs ;
- un moyen d'augmenter la probabilité de gagner ;
- un système garantissant un quelconque gain.

## 2. Posture éthique et scientifique (non négociable)

Ces règles sont des **invariants produit**, appliqués dans le code, l'UI et la communication :

1. Les tirages sont traités comme **aléatoires et indépendants**. Ce postulat est affiché dans le produit.
2. Aucun score n'est jamais présenté comme une **probabilité de gain**. Le vocabulaire imposé est : « score statistique », « combinaison candidate », « selon le modèle ».
3. Un numéro « froid » ou « en retard » n'est **jamais** interprété automatiquement comme « plus susceptible de sortir » (sophisme du joueur — explicitement documenté dans l'UI).
4. Toute stratégie est comparée à `STRATEGY_RANDOM`. Si une stratégie ne bat pas significativement le hasard — ce qui est le résultat attendu sur un tirage équitable — le produit **l'affiche tel quel**.
5. Aucune donnée historique n'est inventée ; chaque tirage conserve sa **source**, sa **date de collecte** et son **statut de validation**.
6. Aucun backtest n'utilise de données futures (validation temporelle stricte, cf. [03-pipeline-data-ml.md](03-pipeline-data-ml.md)).
7. La collecte respecte les sites sources : pas de contournement de protection, d'authentification ou de mesure de sécurité ; respect des CGU et du robots.txt.
8. Un **avertissement sur le jeu responsable** est visible dans l'application (le jeu comporte des risques : endettement, dépendance).

## 3. Utilisateurs cibles

| Persona | Besoin | Plan |
|---|---|---|
| Joueur curieux | Consulter les derniers résultats, les stats de base | FREE |
| Joueur analytique | Historique complet, analyses avancées, combinaisons candidates, backtesting | PREMIUM |
| Power user / revendeur de contenu | API, exports, modèles supplémentaires | PRO |
| Administrateur (interne) | Gestion des données, des sources, des utilisateurs, des modèles | Backoffice |

## 4. Piliers produit

1. **Données fiables** — pipeline d'ingestion journalisé, contrôle qualité, statuts `VALID / INVALID / PENDING_REVIEW`, traçabilité complète.
2. **Analyses riches** — fréquences, chaud/froid, retards, paires/triplets, consécutifs, pair/impair, haut/bas, sommes, dispersion, répétitions, le tout sur fenêtres temporelles configurables.
3. **Modélisation honnête** — des modèles simples et interprétables d'abord, du ML expérimental ensuite, toujours confrontés au hasard.
4. **Explicabilité** — chaque combinaison candidate expose la décomposition de son score ; un module « AI Analyst » traduit les statistiques calculées en langage naturel, sans jamais inventer de données.
5. **Produit évolutif** — architecture multi-jeux, multi-sources, prête pour le SaaS (plans, abonnements, API publique).

## 5. Périmètre initial

- **Jeu** : Loto Bonheur LONACI — 5 numéros parmi **1 à 90**, deux ensembles par tirage (**numéros gagnants** + **numéros machine**), **plusieurs tirages nommés par jour** (ex. Réveil, Étoile, Akwaba, Monni, Sika, Fortune, Baraka…). La liste exacte des tirages quotidiens et leurs horaires seront confirmés lors de la mise en place de la collecte (le modèle de données est paramétrable, cf. [02-modele-donnees.md](02-modele-donnees.md)).
- **Données** : aucune donnée initiale — la collecte depuis des sources publiques est la première brique, complétée par des imports fichiers (CSV/Excel/JSON) et la saisie manuelle admin.
- **Front MVP** : application **web** (Next.js). Mobile React Native en phase ultérieure.

## 6. Proposition de valeur

> « Toutes les données du Loto Bonheur, analysées sérieusement : ce que les chiffres disent — et ce qu'ils ne peuvent pas dire. »

La différenciation ne repose pas sur une promesse de prédiction (intenable), mais sur : la profondeur d'analyse, la qualité des données, la transparence méthodologique (backtesting public des stratégies) et l'expérience utilisateur.
