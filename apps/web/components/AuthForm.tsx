'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/types';

/** Formulaire partagé connexion / inscription. */
export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, displayName || undefined);
      router.push('/compte');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue — réessayez.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-4">
      {mode === 'register' ? (
        <div>
          <label htmlFor="displayName" className="mb-1 block text-sm text-ink-2">
            Nom affiché (optionnel)
          </label>
          <input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2"
            autoComplete="nickname"
          />
        </div>
      ) : null}
      <div>
        <label htmlFor="email" className="mb-1 block text-sm text-ink-2">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-border bg-surface-2 px-3 py-2"
          autoComplete="email"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm text-ink-2">
          Mot de passe {mode === 'register' ? '(10 caractères minimum)' : ''}
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={mode === 'register' ? 10 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-border bg-surface-2 px-3 py-2"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
      </div>
      {error ? (
        <p role="alert" className="rounded-md border border-hot/40 bg-hot-soft px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
      <button
        disabled={busy}
        className="w-full rounded-md bg-accent px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        {busy ? '…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
      </button>
    </form>
  );
}
