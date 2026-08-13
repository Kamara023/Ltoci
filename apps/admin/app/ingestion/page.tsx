'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';

interface Run {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  triggeredBy: string;
  fileName: string | null;
  error: string | null;
  stats: Record<string, unknown>;
  source: { code: string; label: string };
}
interface RunEvent {
  id: string;
  level: string;
  message: string;
  createdAt: string;
}

export default function IngestionPage() {
  const qc = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [sourceCode, setSourceCode] = useState('csv-import');
  const fileRef = useRef<HTMLInputElement>(null);
  const [importReport, setImportReport] = useState<string | null>(null);

  const runs = useQuery<{ data: Run[] }>({
    queryKey: ['runs'],
    queryFn: () => adminFetch('/admin/ingestion/runs?limit=25'),
    refetchInterval: 15_000,
  });
  const events = useQuery<{ data: RunEvent[] }>({
    queryKey: ['run-events', selectedRun],
    queryFn: () => adminFetch(`/admin/ingestion/runs/${selectedRun}/events?limit=100`),
    enabled: Boolean(selectedRun),
  });
  const collect = useMutation({
    mutationFn: (mode: 'latest' | 'backfill') =>
      adminFetch('/admin/ingestion/collect', { method: 'POST', body: JSON.stringify({ mode }) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['runs'] }),
  });
  const upload = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error('Choisissez un fichier');
      const form = new FormData();
      form.append('file', file);
      form.append('sourceCode', sourceCode);
      return adminFetch<{ status: string; stats: Record<string, unknown> }>('/admin/imports', {
        method: 'POST',
        body: form,
      });
    },
    onSuccess: (res) => {
      setImportReport(`${res.status} — ${JSON.stringify(res.stats)}`);
      qc.invalidateQueries({ queryKey: ['runs'] });
    },
    onError: (err) => setImportReport(`Échec : ${(err as Error).message}`),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Ingestion</h1>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <h2 className="mb-2 font-semibold">Collecte lotobonheur.ci</h2>
          <div className="flex gap-3">
            <button
              onClick={() => collect.mutate('latest')}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white"
            >
              Collecter le mois courant
            </button>
            <button
              onClick={() => collect.mutate('backfill')}
              className="rounded-md border border-accent px-3 py-1.5 text-sm font-semibold text-accent"
            >
              Backfill complet
            </button>
          </div>
          {collect.isSuccess ? <p className="mt-2 text-xs text-ok">Déclenché ✓</p> : null}
        </div>

        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <h2 className="mb-2 font-semibold">Import de fichier</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sourceCode}
              onChange={(e) => setSourceCode(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            >
              <option value="csv-import">CSV</option>
              <option value="excel-import">Excel</option>
              <option value="json-import">JSON</option>
            </select>
            <input ref={fileRef} type="file" className="text-sm" />
            <button
              onClick={() => upload.mutate()}
              disabled={upload.isPending}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {upload.isPending ? 'Import…' : 'Importer'}
            </button>
          </div>
          {importReport ? <p className="mt-2 text-xs text-ink-2">{importReport}</p> : null}
          <p className="mt-2 text-xs text-ink-3">
            Colonnes attendues : date, tirage, gagnants, machine (optionnelle).
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 font-semibold">Runs récents</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase text-ink-3">
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Début</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(runs.data?.data ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="px-3 py-2">
                      {r.source.code}
                      {r.fileName ? <p className="text-xs text-ink-3">{r.fileName}</p> : null}
                    </td>
                    <td
                      className={`px-3 py-2 font-semibold ${r.status === 'SUCCESS' ? 'text-ok' : r.status === 'FAILED' ? 'text-err' : 'text-warn'}`}
                    >
                      {r.status}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums text-ink-2">
                      {new Date(r.startedAt).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setSelectedRun(r.id)}
                        className="text-xs text-accent underline"
                      >
                        événements
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="mb-2 font-semibold">Événements {selectedRun ? '' : '(sélectionnez un run)'}</h2>
          <div className="max-h-96 overflow-y-auto rounded-lg border border-border bg-surface-2 p-3 text-xs">
            {(events.data?.data ?? []).map((e) => (
              <p key={e.id} className="mb-1">
                <span
                  className={`mr-2 font-semibold ${e.level === 'ERROR' ? 'text-err' : e.level === 'WARN' ? 'text-warn' : 'text-ink-3'}`}
                >
                  {e.level}
                </span>
                {e.message}
              </p>
            ))}
            {selectedRun && events.data?.data.length === 0 ? (
              <p className="text-ink-3">Aucun événement pour ce run.</p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
