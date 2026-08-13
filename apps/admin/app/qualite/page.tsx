'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { QueryError } from '@/components/QueryError';
import { adminFetch } from '@/lib/adminApi';

interface Issue {
  id: string;
  ruleCode: string;
  severity: string;
  details: Record<string, unknown>;
  resolvedAt: string | null;
  createdAt: string;
  draw: {
    id: string;
    drawDate: string;
    status: string;
    drawType: { code: string; name: string };
  } | null;
}

export default function QualityPage() {
  const qc = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);
  const [note, setNote] = useState('Vérifié manuellement');

  const issues = useQuery<{ data: Issue[]; meta: { total: number } }>({
    queryKey: ['issues', showResolved],
    queryFn: () => adminFetch(`/admin/quality/issues?resolved=${showResolved}&limit=50`),
  });
  const resolve = useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/admin/quality/issues/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues'] }),
  });
  const drawAction = useMutation({
    mutationFn: ({ drawId, action }: { drawId: string; action: 'validate' | 'invalidate' }) =>
      adminFetch(`/admin/draws/${drawId}/${action}`, {
        method: 'POST',
        body: JSON.stringify(action === 'invalidate' ? { reason: note } : {}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues'] }),
  });
  const runQuality = useMutation({
    mutationFn: () =>
      adminFetch('/admin/quality/run', { method: 'POST', body: JSON.stringify({ scope: 'pending' }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues'] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Revue qualité</h1>
        <button
          onClick={() => runQuality.mutate()}
          disabled={runQuality.isPending}
          className="rounded-md border border-accent px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent-soft"
        >
          {runQuality.isPending ? '…' : 'Relancer le contrôle (pending)'}
        </button>
      </div>

      {issues.error ? <QueryError error={issues.error} onRetry={() => issues.refetch()} /> : null}

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          Voir les issues résolues
        </label>
        <label className="flex items-center gap-2">
          Note de résolution :
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-72 rounded-md border border-border bg-surface-2 px-2 py-1"
          />
        </label>
        <span className="text-ink-3">{issues.data?.meta.total ?? '—'} issue(s)</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase text-ink-3">
              <th className="px-3 py-2">Règle</th>
              <th className="px-3 py-2">Tirage</th>
              <th className="px-3 py-2">Détails</th>
              <th className="px-3 py-2">Créée</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(issues.data?.data ?? []).map((issue) => (
              <tr key={issue.id} className="border-b border-border/50 align-top">
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-semibold ${
                      issue.severity === 'BLOCKING' ? 'bg-err-soft text-err' : 'bg-accent-soft text-accent'
                    }`}
                  >
                    {issue.ruleCode}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {issue.draw ? (
                    <>
                      <p>{issue.draw.drawType.name}</p>
                      <p className="text-xs tabular-nums text-ink-3">
                        {issue.draw.drawDate.slice(0, 10)} · {issue.draw.status}
                      </p>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="max-w-sm px-3 py-2 text-xs text-ink-2">
                  {JSON.stringify(issue.details)}
                </td>
                <td className="px-3 py-2 text-xs tabular-nums text-ink-3">
                  {new Date(issue.createdAt).toLocaleString('fr-FR')}
                </td>
                <td className="px-3 py-2">
                  {issue.resolvedAt ? (
                    <span className="text-xs text-ok">résolue</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => resolve.mutate(issue.id)}
                        className="rounded border border-ok px-2 py-1 text-xs font-semibold text-ok"
                      >
                        Résoudre
                      </button>
                      {issue.draw ? (
                        <>
                          <button
                            onClick={() =>
                              drawAction.mutate({ drawId: issue.draw!.id, action: 'validate' })
                            }
                            className="rounded border border-border px-2 py-1 text-xs"
                          >
                            Valider tirage
                          </button>
                          <button
                            onClick={() =>
                              drawAction.mutate({ drawId: issue.draw!.id, action: 'invalidate' })
                            }
                            className="rounded border border-err px-2 py-1 text-xs text-err"
                          >
                            Invalider
                          </button>
                        </>
                      ) : null}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {issues.data && issues.data.data.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-3">
            Aucune issue {showResolved ? 'résolue' : 'ouverte'} — la file est propre. ✨
          </p>
        ) : null}
      </div>
    </div>
  );
}
