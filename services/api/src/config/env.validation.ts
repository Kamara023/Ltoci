import { z } from 'zod';

/**
 * Schéma de validation des variables d'environnement.
 * L'application refuse de démarrer si une variable obligatoire manque
 * ou est mal formée — jamais de valeur par défaut silencieuse pour un secret.
 */
export const envSchema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  REDIS_URL: z.string().url().startsWith('redis://'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  ML_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  ML_SERVICE_TOKEN: z.string().min(8),
  INGESTION_SERVICE_URL: z.string().url().default('http://localhost:8001'),
  INGESTION_SERVICE_TOKEN: z.string().min(8),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  // Token d'amorçage du backoffice — REMPLACÉ par JWT/RBAC en PHASE 5.
  ADMIN_BOOTSTRAP_TOKEN: z.string().min(12),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(' ; ');
    throw new Error(`Configuration d'environnement invalide — ${details}`);
  }
  return result.data;
}
