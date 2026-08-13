'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';

export default function AccountPage() {
  const { user, ready, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace('/connexion');
  }, [ready, user, router]);

  if (!ready || !user) return <p className="py-8 text-center text-ink-2">Chargement…</p>;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold">Mon compte</h1>
      <dl className="space-y-3 rounded-lg border border-border bg-surface-2 p-4 text-sm">
        <div>
          <dt className="text-ink-3">Email</dt>
          <dd className="font-medium">{user.email}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Nom affiché</dt>
          <dd className="font-medium">{user.displayName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Plan</dt>
          <dd className="font-medium">
            FREE — les plans Premium et Pro arrivent bientôt (paiement Mobile Money).
          </dd>
        </div>
      </dl>
      <button
        onClick={() => logout().then(() => router.push('/'))}
        className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-ink-2 hover:text-ink"
      >
        Se déconnecter
      </button>
    </div>
  );
}
