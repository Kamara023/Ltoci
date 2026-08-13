'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryError } from '@/components/QueryError';
import { adminFetch } from '@/lib/adminApi';

interface Summary {
  draws: Record<string, number>;
  openIssuesByRule: Record<string, number>;
  totalIssues: number;
}
interface StatsStatus {
  available: boolean;
  computed_at?: string;
  counts?: Record<string, number>;
}
interface ForecastsStatus {
  available: boolean;
  active_forecasts?: number;
  evaluated?: number;
  generated_at?: string | null;
}
interface Run {
  id: string;
  status: string;
  startedAt: string;
  triggeredBy: string;
  stats: Record<string, unknown>;
  source: { code: string };
}

function ActionButton({ label, path, invalidate }: { label: string; path: string; invalidate: string[] }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => adminFetch<Record<string, unknown>>(path, { method: 'POST', body: '{}' }),
    onSettled: () => invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
  return (
    <div>
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="rounded-md border border-accent px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent-soft disabled:opacity-50"
      >
        {mutation.isPending ? '…' : label}
      </button>
      {mutation.isSuccess ? <p className="mt-1 text-xs text-ok">Déclenché ✓</p> : null}
      {mutation.isError ? <p className="mt-1 text-xs text-err">Échec</p> : null}
    </div>
  );
}

export default function DashboardPage() {
  const summary = useQuery<Summary>({
    queryKey: ['summary'],
    queryFn: () => adminFetch('/admin/quality/summary'),
  });
  const stats = useQuery<StatsStatus>({
    queryKey: ['stats-status'],
    queryFn: () => adminFetch('/admin/statistics/status'),
  });
  const runs = useQuery<{ data: Run[] }>({
    queryKey: ['runs-latest'],
    queryFn: () => adminFetch('/admin/ingestion/runs?limit=8'),
  });
  const forecasts = useQuery<ForecastsStatus>({
    queryKey: ['forecasts-status'],
    queryFn: () => adminFetch('/admin/forecasts/status'),
  });

  const draws = summary.data?.draws ?? {};
  const total = Object.values(draws).reduce((a, b) => a + b, 0);
  const loading = summary.isLoading || stats.isLoading || runs.isLoading;
  const firstError = summary.error ?? stats.error ?? runs.error;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tableau de bord</h1>

      {firstError ? (
        <QueryError
          error={firstError}
          onRetry={() => {
            summary.refetch();
            stats.refetch();
            runs.refetch();
          }}
        />
      ) : null}
      {loading ? <p className="text-sm text-ink-3">Chargement des indicateurs…</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <p className="text-xs uppercase text-ink-3">Tirages</p>
          <p className="text-2xl font-bold tabular-nums">{total.toLocaleString('fr-FR')}</p>
          <p className="text-xs text-ink-2">
            {(draws['VALID'] ?? 0).toLocaleString('fr-FR')} validés ·{' '}
            {draws['PENDING_REVIEW'] ?? 0} en revue · {draws['INVALID'] ?? 0} invalides
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <p className="text-xs uppercase text-ink-3">Issues qualité ouvertes</p>
          <p className="text-2xl font-bold tabular-nums">
            {Object.values(summary.data?.openIssuesByRule ?? {}).reduce((a, b) => a + b, 0)}
          </p>
          <p className="text-xs text-ink-2">{summary.data?.totalIssues ?? '—'} au total (historique)</p>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <p className="text-xs uppercase text-ink-3">Statistiques</p>
          <p className={`text-2xl font-bold ${stats.data?.available ? 'text-ok' : 'text-err'}`}>
            {stats.data?.available ? 'à jour' : 'indispo'}
          </p>
          <p className="text-xs text-ink-2">
            {stats.data?.computed_at
              ? `calculées le ${new Date(stats.data.computed_at).toLocaleString('fr-FR')}`
              : '—'}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <p className="text-xs uppercase text-ink-3">Lignes matérialisées</p>
          <p className="text-2xl font-bold tabular-nums">
            {(stats.data?.counts?.['number_stats'] ?? 0).toLocaleString('fr-FR')}
          </p>
          <p className="text-xs text-ink-2">stats numéros</p>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <p className="text-xs uppercase text-ink-3">Prévisions TOP 5</p>
          <p className="text-2xl font-bold tabular-nums">
            {(forecasts.data?.active_forecasts ?? 0).toLocaleString('fr-FR')}
          </p>
          <p className="text-xs text-ink-2">
            actives · {forecasts.data?.evaluated ?? 0} évaluées
            {forecasts.data?.generated_at
              ? ` · génération ${new Date(forecasts.data.generated_at).toLocaleString('fr-FR')}`
              : ''}
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface-2 p-4">
        <h2 className="mb-3 font-semibold">Actions</h2>
        <div className="flex flex-wrap gap-3">
          <ActionButton label="Collecter maintenant" path="/admin/ingestion/collect" invalidate={['runs-latest', 'summary']} />
          <ActionButton label="Recalculer les stats" path="/admin/statistics/refresh" invalidate={['stats-status']} />
          <ActionButton label="Régénérer les candidates" path="/admin/predictions/generate" invalidate={[]} />
          <ActionButton label="Relancer les backtests" path="/admin/backtests/run" invalidate={[]} />
          <ActionButton label="Générer les prévisions TOP 5" path="/admin/forecasts/generate" invalidate={['forecasts-status']} />
          <ActionButton label="Évaluer les prévisions" path="/admin/forecasts/evaluate" invalidate={['forecasts-status']} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Derniers runs d’ingestion</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase text-ink-3">
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Déclencheur</th>
                <th className="px-3 py-2">Début</th>
                <th className="px-3 py-2">Stats</th>
              </tr>
            </thead>
            <tbody>
              {(runs.data?.data ?? []).map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="px-3 py-2">{r.source.code}</td>
                  <td className={`px-3 py-2 font-semibold ${r.status === 'SUCCESS' ? 'text-ok' : r.status === 'FAILED' ? 'text-err' : 'text-warn'}`}>
                    {r.status}
                  </td>
                  <td className="px-3 py-2 text-ink-2">{r.triggeredBy}</td>
                  <td className="px-3 py-2 tabular-nums text-ink-2">
                    {new Date(r.startedAt).toLocaleString('fr-FR')}
                  </td>
                  <td className="max-w-md truncate px-3 py-2 text-xs text-ink-3">
                    {JSON.stringify(r.stats)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
