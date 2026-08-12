# 06 — SaaS, monétisation & sécurité

## 1. Plans & entitlements

Les droits sont des **données** (`app.plans.entitlements`, JSONB), lues par un guard NestJS — modifier un plan ne demande aucun déploiement.

| Capacité (entitlement) | FREE | PREMIUM | PRO |
|---|---|---|---|
| Historique consultable | 30 jours | complet | complet |
| Statistiques de base (fréquences, chaud/froid) | ✅ (fenêtres limitées) | ✅ | ✅ |
| Analyses avancées (retards, paires, formes, tendances) | — | ✅ | ✅ |
| Stratégies de combinaisons | 1 (FREQUENCY) | toutes les interprétables | toutes + ML |
| Backtesting (consultation) | — | ✅ | ✅ |
| Backtesting (lancement paramétré) | — | — | ✅ |
| Analyses IA (AI Analyst) | — | ✅ | ✅ |
| Notifications push/email | — | ✅ | ✅ |
| API publique (clés API) | — | — | ✅ |
| Exports CSV/JSON | — | — | ✅ |
| Rate limit / min | 30 | 120 | 600 |

- **Paiement** : agrégateur adapté au marché ivoirien — CinetPay ou Paystack (Mobile Money : Orange Money, MTN MoMo, Moov, Wave + cartes). Stripe en complément pour l'international. Intégration par webhooks → `app.subscriptions` (statut, échéance), avec réconciliation quotidienne.
- **Cycle de vie** : essai PREMIUM 7 jours (optionnel), downgrade automatique à l'expiration (job quotidien), grâce de 3 jours.
- **Évolutivité** : ajouter un plan = insérer une ligne `plans` ; ajouter une capacité = nouvelle clé d'entitlement + `@RequireEntitlement` sur les routes concernées.

## 2. Sécurité

### Authentification & autorisation
- Mots de passe **argon2id** ; verrouillage progressif après échecs répétés.
- **JWT access** courte durée (15 min, signé RS256) + **refresh token rotatif** (30 j) stocké **hashé** en base, révocable par session (table `refresh_tokens`), détection de réutilisation (vol de token → révocation de la famille).
- **RBAC** : rôles `USER / ADMIN / SUPERADMIN` (guards NestJS) + **entitlements de plan** orthogonaux aux rôles.
- Clés API PRO hashées, révocables, avec `last_used_at`.
- MFA TOTP pour les comptes admin.

### Protection de l'API
- Validation stricte des entrées (class-validator, DTO typés) ; échappement systématique (Prisma paramétrise ; aucun SQL concaténé).
- Rate limiting Redis par IP (anonyme) et par utilisateur/clé (connecté), quotas par plan.
- Helmet, CORS liste blanche, limites de taille de payload, protection brute-force sur `/auth/*`.
- Uploads d'import : extension + type MIME vérifiés, taille bornée, parsés en sandbox (jamais exécutés), stockés hors racine web.

### Secrets & données
- Secrets uniquement via variables d'environnement (`.env` jamais commité, `.env.example` documenté) ; en prod : secrets Docker ou store dédié.
- Chiffrement au repos des champs sensibles si besoin (références de paiement) ; TLS partout (Nginx + Let's Encrypt) ; cookies `HttpOnly/Secure/SameSite` si sessions web.
- Sauvegardes chiffrées, accès base restreint au réseau Docker interne, service ML non exposé publiquement.
- Journalisation : logs structurés sans données sensibles (pas de tokens, pas de mots de passe), `audit_logs` pour toute action admin.
- Conformité : mentions légales, politique de confidentialité, consentement cookies, droit à l'effacement (anonymisation du compte) ; message **jeu responsable** obligatoire.

### CI/CD & chaîne d'approvisionnement
- Dependabot/Renovate + `pnpm audit` / `pip-audit` en CI ; images Docker minimales (distroless/slim) scannées (Trivy) ; utilisateurs non-root dans les conteneurs.
