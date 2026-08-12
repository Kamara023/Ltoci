/**
 * Enums et constantes partagés du domaine LotoStats.
 * Source de vérité côté TypeScript — doit rester aligné avec le schéma Prisma
 * (services/api/prisma/schema.prisma) et le seed.
 */

/** Statut de validation d'un tirage importé. */
export enum ValidationStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',
  VALID = 'VALID',
  INVALID = 'INVALID',
}

/** Types d'ensembles de numéros d'un tirage (Loto Bonheur : gagnants + machine). */
export enum SetTypeCode {
  WINNING = 'WINNING',
  MACHINE = 'MACHINE',
  BONUS = 'BONUS',
}

/** Nature d'une source de données. */
export enum SourceKind {
  SCRAPER = 'SCRAPER',
  CSV = 'CSV',
  EXCEL = 'EXCEL',
  JSON = 'JSON',
  MANUAL = 'MANUAL',
  API = 'API',
}

/** Statut d'un run (ingestion, job, backtest). */
export enum RunStatus {
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
}

/** Plans SaaS. */
export enum PlanCode {
  FREE = 'FREE',
  PREMIUM = 'PREMIUM',
  PRO = 'PRO',
}

/** Rôles applicatifs (RBAC). */
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPERADMIN = 'SUPERADMIN',
}

/** Codes des stratégies de génération de combinaisons candidates. */
export enum StrategyCode {
  STRATEGY_RANDOM = 'STRATEGY_RANDOM',
  STRATEGY_FREQUENCY = 'STRATEGY_FREQUENCY',
  STRATEGY_HOT_NUMBERS = 'STRATEGY_HOT_NUMBERS',
  STRATEGY_COLD_NUMBERS = 'STRATEGY_COLD_NUMBERS',
  STRATEGY_RECENCY = 'STRATEGY_RECENCY',
  STRATEGY_BALANCED = 'STRATEGY_BALANCED',
  STRATEGY_COOCCURRENCE = 'STRATEGY_COOCCURRENCE',
  STRATEGY_STATISTICAL = 'STRATEGY_STATISTICAL',
  STRATEGY_MONTE_CARLO = 'STRATEGY_MONTE_CARLO',
  STRATEGY_ML_RF = 'STRATEGY_ML_RF',
  STRATEGY_ML_GB = 'STRATEGY_ML_GB',
  STRATEGY_ENSEMBLE = 'STRATEGY_ENSEMBLE',
}

/** Types de notifications. */
export enum NotificationType {
  NEW_DRAW = 'NEW_DRAW',
  NEW_ANALYSIS = 'NEW_ANALYSIS',
  NEW_CANDIDATES = 'NEW_CANDIDATES',
  ANOMALY = 'ANOMALY',
  SOURCE_DOWN = 'SOURCE_DOWN',
  MODEL_REFRESHED = 'MODEL_REFRESHED',
}

/** Fenêtres d'analyse pré-définies. */
export enum AnalysisWindow {
  ALL = 'ALL',
  LAST_100 = 'LAST_100',
  LAST_50 = 'LAST_50',
  LAST_20 = 'LAST_20',
  LAST_10 = 'LAST_10',
}

/** Codes des règles de qualité des données. */
export enum QualityRuleCode {
  SOURCE_CONFLICT = 'SOURCE_CONFLICT',
  OUT_OF_RANGE = 'OUT_OF_RANGE',
  BAD_CARDINALITY = 'BAD_CARDINALITY',
  DUP_IN_SET = 'DUP_IN_SET',
  MISSING_SET = 'MISSING_SET',
  INVALID_DATE = 'INVALID_DATE',
  UNSCHEDULED = 'UNSCHEDULED',
  FORMAT_CHANGE = 'FORMAT_CHANGE',
}

/** Sévérité d'une règle de qualité. */
export enum QualityRuleSeverity {
  /** Bloquant → tirage INVALID. */
  BLOCKING = 'BLOCKING',
  /** Avertissement → tirage PENDING_REVIEW. */
  WARNING = 'WARNING',
}

/**
 * Avertissement affiché avec toute réponse de statistiques « chaud/froid »
 * et toute combinaison candidate. Non désactivable (invariant produit).
 */
export const STATISTICAL_DISCLAIMER =
  'Les tirages de loterie sont aléatoires et indépendants. Ces indicateurs sont descriptifs : ' +
  'ils ne prédisent pas les résultats futurs et ne modifient pas les probabilités de gain.';
