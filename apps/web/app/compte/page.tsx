'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { ApiError, ApiUser } from '@/lib/types';

const PLAN_LABELS: Record<string, { label: string; note: string; style: string }> = {
  FREE: {
    label: 'FREE',
    note: 'Les plans Premium et Pro arrivent bientôt (paiement Mobile Money).',
    style: 'border-border bg-surface-2 text-ink-2',
  },
  PREMIUM: {
    label: 'PREMIUM',
    note: 'Statistiques avancées, toutes fenêtres, backtesting.',
    style: 'border-accent bg-accent-soft text-accent',
  },
  PRO: {
    label: 'PRO',
    note: 'Accès complet : prévisions TOP 5, toutes stratégies, backtesting à la demande, exports.',
    style: 'border-hot bg-hot-soft text-hot',
  },
};

export default function AccountPage() {
  const { user, ready, logout, authFetch } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace('/connexion');
  }, [ready, user, router]);

  // Le plan effectif vient TOUJOURS de l'API (/me) — jamais du localStorage,
  // pour refléter immédiatement un changement de souscription.
  const me = useQuery<ApiUser & { plan?: string }, ApiError>({
    queryKey: ['me'],
    queryFn: () => authFetch('/me'),
    enabled: Boolean(ready && user),
  });

  if (!ready || !user) return <p className="py-8 text-center text-ink-2">Chargement…</p>;

  const plan = PLAN_LABELS[me.data?.plan ?? ''] ?? null;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold">Mon compte</h1>
      <dl className="space-y-3 rounded-lg border border-border bg-surface-2 p-4 text-sm">
        <div>
          <dt className="text-ink-3">Email</dt>
          <dd className="font-medium">{me.data?.email ?? user.email}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Nom affiché</dt>
          <dd className="font-medium">{me.data?.displayName ?? user.displayName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Plan</dt>
          <dd className="font-medium">
            {me.isLoading ? (
              '…'
            ) : plan ? (
              <>
                <span
                  className={`mr-2 rounded-full border px-2 py-0.5 text-xs font-bold ${plan.style}`}
                >
                  {plan.label}
                </span>
                <span className="text-ink-2">{plan.note}</span>
              </>
            ) : (
              <span className="text-ink-2">indisponible pour le moment</span>
            )}
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
