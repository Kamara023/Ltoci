'use client';

/**
 * Comparatif des backtests — la preuve honnête du produit : chaque stratégie
 * face à la sélection aléatoire, résultats affichés quels qu'ils soient.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { STR } from '@/lib/strings';
import { ApiError } from '@/lib/types';
import { DisclaimerBanner } from './DisclaimerBanner';
import { UpsellCard } from './UpsellCard';

interface BacktestRow {
  id: string;
  strategy: { code: string; name: string };
  from: string;
  to: string;
  points: number;
  avgMatches: number | null;
  deltaVsRandom: number | null;
  pValue: number | null;
  expectedAvg: number;
}

export function BacktestsHub() {
  const { authFetch } = useAuth();
  const query = useQuery<{ data: BacktestRow[]; method: string }, ApiError>({
    queryKey: ['backtests'],
    queryFn: () => authFetch('/backtests'),
    retry: false,
  });

  if (query.isLoading) return <p className="py-8 text-center text-ink-2">Chargement…</p>;
  if (query.error) {
    return query.error.status === 403 ? (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold">Backtesting des stratégies</h1>
        <UpsellCard message="Le backtesting complet (chaque stratégie comparée au hasard sur tout l’historique) fait partie du plan Premium." />
      </div>
    ) : (
      <p className="py-8 text-center text-ink-2">{STR.dataUnavailable}</p>
    );
  }
  const rows = query.data?.data ?? [];
  const first = rows[0];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Backtesting des stratégies</h1>
      <p className="max-w-2xl text-sm text-ink-2">
        Simulation honnête sur {first ? first.points.toLocaleString('fr-FR') : '—'} tirages (
        {first ? `${first.from} → ${first.to}` : '—'}) : à chaque pas, la stratégie ne connaît
        que le passé et joue sa meilleure combinaison. Référence théorique :{' '}
        <strong>≈ 0,278</strong> bon numéro par tirage.
      </p>
      <DisclaimerBanner />

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase text-ink-3">
              <th className="px-3 py-2">Stratégie</th>
              <th className="px-3 py-2">Moyenne</th>
              <th className="px-3 py-2">Écart vs aléatoire</th>
              <th className="px-3 py-2">p-value</th>
              <th className="px-3 py-2">Lecture</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((b) => {
              const isRandom = b.strategy.code === 'STRATEGY_RANDOM';
              const significant = b.pValue !== null && b.pValue < 0.006 && !isRandom;
              return (
                <tr key={b.id} className="border-b border-border/60">
                  <td className="px-3 py-2 font-medium">
                    {b.strategy.name}
                    {isRandom ? (
                      <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-ink-3">
                        référence
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{b.avgMatches?.toFixed(4) ?? '—'}</td>
                  <td className="px-3 py-2">
                    {isRandom
                      ? '—'
                      : `${(b.deltaVsRandom ?? 0) >= 0 ? '+' : ''}${b.deltaVsRandom?.toFixed(4)}`}
                  </td>
                  <td className="px-3 py-2">{isRandom ? '—' : (b.pValue?.toFixed(4) ?? '—')}</td>
                  <td className="px-3 py-2 text-xs text-ink-2">
                    {isRandom
                      ? 'baseline — proche de 0,278 = harnais valide'
                      : significant
                        ? 'écart mesurable sur le passé — sans valeur prédictive'
                        : 'indiscernable du hasard (résultat attendu)'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-border bg-surface-2 p-4 text-xs leading-relaxed text-ink-2">
        <p className="mb-1 font-semibold text-ink">Comment lire ces résultats ?</p>
        <p>
          Un écart « statistiquement significatif » sur l’historique décrit le passé, pas
          l’avenir : les comparaisons multiples produisent mécaniquement des faux positifs (seuil
          corrigé ≈ 0,006 pour 8 stratégies), et même un écart réel de +0,02 bon numéro par
          tirage ne modifie en rien la probabilité de décrocher un gros lot (1 sur 43 949 268
          pour 5 numéros). Si toutes les stratégies étaient indiscernables du hasard, ce serait
          le résultat scientifiquement attendu — et nous l’afficherions tel quel.
        </p>
      </div>
    </div>
  );
}
