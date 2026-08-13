'use client';

/**
 * Hub statistiques interactif : sélecteurs fenêtre/ensemble, onglets
 * Fréquences / Chaud & Froid / Retards. Le gating est appliqué par l'API :
 * un 403 (fenêtre ou fonctionnalité hors plan) affiche un UpsellCard.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { STR } from '@/lib/strings';
import { ApiError, NumberStatsResponse } from '@/lib/types';
import { DisclaimerBanner } from './DisclaimerBanner';
import { FrequencyChart } from './FrequencyChart';
import { NumberBall } from './NumberBall';
import { UpsellCard } from './UpsellCard';

const WINDOWS = ['LAST_10', 'LAST_20', 'LAST_50', 'LAST_100', 'ALL'];
const TABS = [
  { id: 'frequencies', label: 'Fréquences' },
  { id: 'hotcold', label: 'Chaud & froid' },
  { id: 'delays', label: 'Retards (Premium)' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function StatsHub() {
  const { authFetch } = useAuth();
  const [window_, setWindow] = useState('LAST_20');
  const [setType, setSetType] = useState<'WINNING' | 'MACHINE'>('WINNING');
  const [tab, setTab] = useState<TabId>('frequencies');

  const endpoint = tab === 'delays' ? 'delays' : 'frequencies';
  const query = useQuery<NumberStatsResponse, ApiError>({
    queryKey: ['stats', endpoint, window_, setType],
    queryFn: () =>
      authFetch<NumberStatsResponse>(
        `/statistics/${endpoint}?window=${window_}&setType=${setType}`,
      ),
    retry: false,
  });

  const hot = [...(query.data?.data ?? [])]
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10);
  const cold = [...(query.data?.data ?? [])]
    .sort((a, b) => a.frequency - b.frequency)
    .slice(0, 10);
  const delayed = [...(query.data?.data ?? [])]
    .sort((a, b) => b.currentGap - a.currentGap)
    .slice(0, 15);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Statistiques</h1>
      <DisclaimerBanner />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-border" role="tablist" aria-label="Ensemble">
          {(['WINNING', 'MACHINE'] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={setType === s}
              onClick={() => setSetType(s)}
              className={`px-3 py-1.5 text-sm ${setType === s ? 'bg-accent text-white' : 'text-ink-2'}`}
            >
              {STR.sets[s]}
            </button>
          ))}
        </div>
        <label className="text-sm text-ink-2" htmlFor="window">
          Fenêtre
        </label>
        <select
          id="window"
          value={window_}
          onChange={(e) => setWindow(e.target.value)}
          className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm"
        >
          {WINDOWS.map((w) => (
            <option key={w} value={w}>
              {STR.windows[w]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-1 border-b border-border" role="tablist" aria-label="Analyses">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === t.id
                ? 'border-accent font-semibold text-accent'
                : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <p className="py-8 text-center text-ink-2">Chargement…</p>
      ) : query.error ? (
        query.error.status === 403 ? (
          <UpsellCard message={query.error.message} />
        ) : (
          <p className="py-8 text-center text-ink-2">{STR.dataUnavailable}</p>
        )
      ) : query.data ? (
        <div className="space-y-6">
          {tab === 'frequencies' ? (
            <section>
              <h2 className="mb-2 font-semibold">
                Fréquence d’apparition — {STR.sets[setType]}, {STR.windows[window_]}
              </h2>
              <FrequencyChart data={query.data.data} highlight={hot.slice(0, 5).map((s) => s.number)} />
              <p className="mt-1 text-xs text-ink-3">
                En orange : les 5 numéros les plus fréquents de la fenêtre.
                {query.data.meta.computedAt
                  ? ` Calculé le ${new Date(String(query.data.meta.computedAt)).toLocaleString('fr-FR')}.`
                  : ''}
              </p>
            </section>
          ) : null}

          {tab === 'hotcold' ? (
            <div className="grid gap-6 sm:grid-cols-2">
              <section>
                <h2 className="mb-2 font-semibold">Les plus fréquents</h2>
                <div className="flex flex-wrap gap-2">
                  {hot.map((s) => (
                    <NumberBall key={s.number} number={s.number} variant="hot" title={`${s.frequency} apparitions`} />
                  ))}
                </div>
              </section>
              <section>
                <h2 className="mb-2 font-semibold">Les moins fréquents</h2>
                <div className="flex flex-wrap gap-2">
                  {cold.map((s) => (
                    <NumberBall key={s.number} number={s.number} variant="cold" title={`${s.frequency} apparitions`} />
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-3">
                  Rappel : un numéro peu sorti n’est pas « dû » — chaque tirage est indépendant.
                </p>
              </section>
            </div>
          ) : null}

          {tab === 'delays' ? (
            <section>
              <h2 className="mb-2 font-semibold">Plus longs retards actuels</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-ink-3">
                    <th className="py-2">Numéro</th>
                    <th>Retard actuel</th>
                    <th>Retard moyen</th>
                    <th>Retard max</th>
                    <th>Dernière sortie</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {delayed.map((s) => (
                    <tr key={s.number} className="border-b border-border/60">
                      <td className="py-2">
                        <NumberBall number={s.number} size="sm" variant="late" />
                      </td>
                      <td>{s.currentGap} tirages</td>
                      <td>{s.avgGap ?? '—'}</td>
                      <td>{s.maxGap ?? '—'}</td>
                      <td>{s.lastSeenDate ?? 'jamais (fenêtre)'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
