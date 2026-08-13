'use client';

/**
 * Authentification côté client : tokens en localStorage, refresh silencieux
 * sur expiration, contexte React minimal. Le serveur reste la seule autorité
 * (le gating est appliqué par l'API, jamais par le front).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from './api';
import { ApiError, ApiUser } from './types';

const STORAGE_KEY = 'lotostats.auth';

interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
}

interface AuthContextValue {
  user: ApiUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  /** fetch authentifié avec refresh silencieux sur 401. */
  authFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStored(): StoredAuth | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = useState<StoredAuth | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Hydratation depuis localStorage : doit se faire APRÈS le premier rendu
    // (SSR/CSR identiques), d'où le setState volontaire dans l'effet.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStored(readStored());
    setReady(true);
  }, []);

  const persist = useCallback((value: StoredAuth | null) => {
    setStored(value);
    if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiFetch<StoredAuth & { user: ApiUser }>(`/auth/login`, {
        init: { method: 'POST', body: JSON.stringify({ email, password }) },
      });
      persist({ accessToken: res.accessToken, refreshToken: res.refreshToken, user: res.user });
    },
    [persist],
  );

  const register = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const res = await apiFetch<StoredAuth & { user: ApiUser }>(`/auth/register`, {
        init: { method: 'POST', body: JSON.stringify({ email, password, displayName }) },
      });
      persist({ accessToken: res.accessToken, refreshToken: res.refreshToken, user: res.user });
    },
    [persist],
  );

  const logout = useCallback(async () => {
    const current = readStored();
    if (current) {
      await apiFetch(`/auth/logout`, {
        init: { method: 'POST', body: JSON.stringify({ refreshToken: current.refreshToken }) },
      }).catch(() => undefined);
    }
    persist(null);
  }, [persist]);

  const refresh = useCallback(async (): Promise<StoredAuth | null> => {
    const current = readStored();
    if (!current) return null;
    try {
      const res = await apiFetch<StoredAuth>(`/auth/refresh`, {
        init: { method: 'POST', body: JSON.stringify({ refreshToken: current.refreshToken }) },
      });
      const next = { ...current, accessToken: res.accessToken, refreshToken: res.refreshToken };
      persist(next);
      return next;
    } catch {
      persist(null);
      return null;
    }
  }, [persist]);

  const authFetch = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const current = readStored();
      try {
        return await apiFetch<T>(path, { token: current?.accessToken ?? null, init });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401 && current) {
          const renewed = await refresh();
          if (renewed) return apiFetch<T>(path, { token: renewed.accessToken, init });
        }
        throw err;
      }
    },
    [refresh],
  );

  const value = useMemo(
    () => ({ user: stored?.user ?? null, ready, login, register, logout, authFetch }),
    [stored, ready, login, register, logout, authFetch],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé sous <AuthProvider>');
  return ctx;
}
