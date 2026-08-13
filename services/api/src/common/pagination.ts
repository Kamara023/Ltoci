/** Enveloppe de pagination standard de l'API. */
export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

export function paginated<T>(data: T[], page: number, limit: number, total: number): Paginated<T> {
  return { data, meta: { page, limit, total } };
}

export function clampLimit(limit: number, max = 100): number {
  return Math.max(1, Math.min(limit, max));
}
