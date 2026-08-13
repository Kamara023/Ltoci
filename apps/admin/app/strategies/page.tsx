'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { adminFetch } from '@/lib/adminApi';

interface Strategy {
  code: string;
  name: string;
  description: string;
  isEnabled: boolean;
  minPlan: string;
  defaultConfig: Record<string, unknown>;
}

function StrategyRow({ strategy }: { strategy: Strategy }) {
  const qc = useQueryClient();
  const [config, setConfig] = useState(JSON.stringify(strategy.defaultConfig, null, 0));
  const [configError, setConfigError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      adminFetch(`/admin/strategies/${strategy.code}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['strategies'] }),
  });

  function saveConfig() {
    try {
      const parsed = JSON.parse(config);
      setConfigError(null);
      mutation.mutate({ defaultConfig: parsed });
    } catch {
      setConfigError('JSON invalide');
    }
  }

  return (
    <tr className="border-b border-border/50 align-top">
      <td className="px-3 py-2">
        <p className="font-medium">{strategy.name}</p>
        <p className="max-w-xs text-xs text-ink-3">{strategy.code}</p>
      </td>
      <td className="px-3 py-2">
        <button
          onClick={() => mutation.mutate({ isEnabled: !strategy.isEnabled })}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            strategy.isEnabled ? 'bg-ok/15 text-ok' : 'bg-surface text-ink-3 border border-border'
          }`}
        >
          {strategy.isEnabled ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td className="px-3 py-2">
        <select
          value={strategy.minPlan}
          onChange={(e) => mutation.mutate({ minPlan: e.target.value })}
          className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
        >
          {['FREE', 'PREMIUM', 'PRO'].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-start gap-2">
          <textarea
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            rows={2}
            className="w-64 rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs"
          />
          <button
            onClick={saveConfig}
            className="rounded-md border border-accent px-2 py-1 text-xs font-semibold text-accent"
          >
            Appliquer
          </button>
        </div>
        {configError ? <p className="text-xs text-err">{configError}</p> : null}
        {mutation.isError ? <p className="text-xs text-err">Échec de la mise à jour</p> : null}
      </td>
    </tr>
  );
}

export default function StrategiesPage() {
  const query = useQuery<{ data: Strategy[] }>({
    queryKey: ['strategies'],
    queryFn: () => adminFetch('/admin/strategies'),
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Stratégies</h1>
      <p className="max-w-2xl text-sm text-ink-2">
        Les coefficients s’appliquent à la prochaine génération, sans déploiement. Le plan minimum
        contrôle le gating côté API.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase text-ink-3">
              <th className="px-3 py-2">Stratégie</th>
              <th className="px-3 py-2">État</th>
              <th className="px-3 py-2">Plan min.</th>
              <th className="px-3 py-2">Configuration (JSON)</th>
            </tr>
          </thead>
          <tbody>
            {(query.data?.data ?? []).map((s) => (
              <StrategyRow key={s.code} strategy={s} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
