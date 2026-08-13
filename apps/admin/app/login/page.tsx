'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { API_URL, setAdminToken } from '@/lib/adminApi';

export default function LoginPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/quality/summary`, {
        headers: { 'X-Admin-Token': token },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAdminToken(token);
      router.push('/');
    } catch {
      setError('Token invalide ou API injoignable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-center text-2xl font-bold">
        <span className="text-accent">LotoStats</span> Admin
      </h1>
      <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-surface-2 p-6">
        <label htmlFor="token" className="block text-sm text-ink-2">
          Token administrateur
        </label>
        <input
          id="token"
          type="password"
          required
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2"
          autoComplete="off"
        />
        <p className="text-xs text-ink-3">
          C’est la valeur de <code className="rounded bg-surface px-1">ADMIN_BOOTSTRAP_TOKEN</code>{' '}
          dans le fichier <code className="rounded bg-surface px-1">.env</code> à la racine du
          projet — pas un mot de passe personnel.
        </p>
        {error ? (
          <p role="alert" className="rounded-md border border-err/40 bg-err-soft px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
        <button
          disabled={busy}
          className="w-full rounded-md bg-accent px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Vérification…' : 'Déverrouiller'}
        </button>
      </form>
      <p className="text-center text-xs text-ink-3">
        Accès réservé — chaque action est journalisée.
      </p>
    </div>
  );
}
