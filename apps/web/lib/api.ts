import { ApiError, ApiErrorBody } from './types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/**
 * Fetch typé vers l'API LotoStats — utilisable côté serveur (sans token)
 * et côté client (token optionnel). Toute erreur remonte en ApiError avec
 * le code du format unifié { error: { code, message, requestId } }.
 */
export async function apiFetch<T>(
  path: string,
  options: { token?: string | null; init?: RequestInit } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.init?.headers as Record<string, string>) ?? {}),
  };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;

  const res = await fetch(`${API_URL}${path}`, {
    cache: 'no-store',
    ...options.init,
    headers,
  });
  if (!res.ok) {
    let code = 'ERROR';
    let message = `Erreur ${res.status}`;
    try {
      const body = (await res.json()) as ApiErrorBody;
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      /* corps non JSON */
    }
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}

/** Variante serveur avec repli : null au lieu d'une exception (pages publiques). */
export async function tryFetch<T>(path: string): Promise<T | null> {
  try {
    return await apiFetch<T>(path);
  } catch {
    return null;
  }
}
