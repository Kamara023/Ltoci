'use client';

import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '@/lib/adminApi';

interface JobRun {
  id: string;
  queue: string;
  jobName: string;
  status: string;
  startedAt: string;
  durationMs: number | null;
  error: string | null;
}

export default function JobsPage() {
  const jobs = useQuery<{ data: JobRun[]; meta: { total: number } }>({
    queryKey: ['jobs'],
    queryFn: () => adminFetch('/admin/jobs?limit=50'),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Jobs planifiés</h1>
      <p className="text-sm text-ink-2">
        Collecte horaire (:20), rattrapage quotidien (23:50), backtest hebdomadaire (lundi 04:00).
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase text-ink-3">
              <th className="px-3 py-2">Job</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Début</th>
              <th className="px-3 py-2">Durée</th>
              <th className="px-3 py-2">Erreur</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {(jobs.data?.data ?? []).map((j) => (
              <tr key={j.id} className="border-b border-border/50">
                <td className="px-3 py-2">{j.jobName}</td>
                <td
                  className={`px-3 py-2 font-semibold ${j.status === 'SUCCESS' ? 'text-ok' : 'text-err'}`}
                >
                  {j.status}
                </td>
                <td className="px-3 py-2 text-xs text-ink-2">
                  {new Date(j.startedAt).toLocaleString('fr-FR')}
                </td>
                <td className="px-3 py-2 text-xs">{j.durationMs != null ? `${j.durationMs} ms` : '—'}</td>
                <td className="max-w-md truncate px-3 py-2 text-xs text-err">{j.error ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {jobs.data?.data.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-3">Aucun job exécuté pour le moment.</p>
        ) : null}
      </div>
    </div>
  );
}
