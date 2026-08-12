# 08 — Risques techniques, limites statistiques & recommandations

## 1. Limites statistiques (à afficher, pas à cacher)

1. **Un tirage équitable est imprévisible par construction.** Si le Loto Bonheur est équitable, chaque combinaison de 5 numéros parmi 90 a exactement la même probabilité (1 / C(90,5) = 1 / 43 949 268) à chaque tirage, quel que soit l'historique. **Aucune analyse de cette plateforme ne peut modifier cette probabilité.** C'est le message central de la page /methodologie.
2. **Espérance de référence** : pour 5 numéros joués sur un tirage 5/90, l'espérance du nombre de correspondances est 5×(5/90) ≈ **0,278**. Toute stratégie backtestée doit être lue par rapport à cette référence — des écarts apparents sur de petits échantillons sont attendus par simple variance.
3. **Sophisme du joueur** : un numéro « en retard » n'est pas « dû ». Un numéro « chaud » n'est pas « en forme ». Le produit affiche ces indicateurs comme descriptifs et le rappelle contextuellement.
4. **Comparaisons multiples** : en testant beaucoup de stratégies sur beaucoup de fenêtres, certaines paraîtront « significatives » par hasard (p-hacking). Parades : correction de tests multiples affichée, backtests sur périodes hors-échantillon, et honnêteté d'affichage (« non significatif après correction »).
5. **Petits échantillons** : quelques milliers de tirages restent peu pour des statistiques fines sur 90 numéros (les triplets surtout). Les intervalles de confiance sont affichés quand c'est pertinent.
6. **Le ML n'y changera rien** sur un processus i.i.d. : les modèles RF/GB/XGBoost sont présentés comme **expérimentaux et pédagogiques** ; l'attendu scientifique est qu'ils ne battent pas la baseline aléatoire de façon stable — et le backtesting le montrera publiquement. C'est un argument de crédibilité du produit, pas une faiblesse.
7. **Valeur réelle du produit** : information (résultats fiables et rapides), exploration statistique rigoureuse, transparence méthodologique, et confort d'usage — pas la prédiction.

## 2. Risques techniques

| Risque | Impact | Probabilité | Mitigation |
|---|---|---|---|
| Source de résultats indisponible ou structure modifiée | rupture de collecte | élevée | multi-sources, détection `FORMAT_CHANGE`, alerte, saisie manuelle/imports en secours, payload brut conservé pour re-parsing |
| Ambiguïté sur les règles réelles (liste des tirages quotidiens, horaires) | mauvaise modélisation | moyenne | référentiel paramétrable en base, confirmation avec la source en PHASE 2, correction sans migration |
| Qualité des données historiques (trous, erreurs de sources tierces) | statistiques biaisées | moyenne | statuts de validation, croisement de sources par priorité, affichage de la couverture des données (« historique complet depuis le JJ/MM/AAAA ») |
| Aspect légal/CGU du scraping | juridique | moyenne | respect robots.txt/CGU, fréquence minimale, User-Agent identifiable, priorité aux sources autorisées, bascule sur saisie manuelle si refus |
| Cadre réglementaire des jeux d'argent en CI (communication autour des jeux) | conformité | moyenne | positionnement strictement informationnel, disclaimers, pas de prise de paris, avis juridique avant lancement commercial |
| Revue des stores mobiles (catégorie jeux d'argent) | retard phase mobile | moyenne | app purement informationnelle, web-app responsive en attendant, préparation des métadonnées de conformité |
| Dérive de complexité (2 langages, 5 services) | vélocité | moyenne | monorepo outillé, contrats typés partagés, docker compose dev unique, phases strictement incrémentales |
| Fuite temporelle dans les backtests | crédibilité détruite | faible mais critique | `cutoff_draw_id` structurel, tests automatiques anti-leakage, revue de code dédiée |
| Coûts LLM (AI Analyst) | budget | faible | gabarits déterministes par défaut, LLM en option PREMIUM avec cache des analyses |
| Sécurité (données utilisateurs, paiements) | juridique/réputation | faible | cf. [06-saas-securite.md](06-saas-securite.md), paiements délégués à l'agrégateur (pas de stockage carte) |

## 3. Recommandations

1. **Démarrer par la donnée** : la valeur du produit dépend d'un historique fiable. Prioriser la constitution d'un historique profond (backfill) et sa validation avant tout raffinement ML.
2. **Web-app responsive d'abord** : elle couvre l'usage mobile initial et évite le risque stores pendant le MVP.
3. **Assumer la transparence comme différenciateur** : publier la méthodologie et les backtests (y compris quand les stratégies ne battent pas le hasard) crédibilise la plateforme face aux « pronostiqueurs » opaques.
4. **Gabarits déterministes avant LLM** pour l'AI Analyst : même valeur perçue au MVP, zéro risque d'hallucination, coût nul.
5. **Une seule base, des schémas séparés** : éviter le micro-découpage prématuré (pas de base par service) ; la volumétrie ne le justifie pas.
6. **Figer les contrats tôt** : DTO partagés (`packages/types`) et OpenAPI dès la PHASE 5 pour paralléliser front/back sereinement.
7. **Prévoir l'avis juridique** (CGU sources + réglementation locale des jeux) avant le lancement commercial payant.
