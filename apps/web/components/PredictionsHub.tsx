'use client';

/**
 * Combinaisons candidates : sélecteur de stratégie (verrouillage par plan),
 * candidates du jour avec score décomposé et explication. Le gating est
 * appliqué par l'API — un 403 affiche l'UpsellCard.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { STR } from '@/lib/strings';
import { ApiError } from '@/lib/types';
import { Candidate, CandidateCard } from './CandidateCard';
import { DisclaimerBanner } from './DisclaimerBanner';
import { UpsellCard } from './UpsellCard';

interface StrategyInfo {
  code: string;
  name: string;
  description: string;
  minPlan: string;
  isEnabled: boolean;
}

interface PredictionSummary {
  id: string;
  strategy: { code: string; name: string };
  targetDrawDate: string;
  combinations: number;
}

interface PredictionDetail {
  id: string;
  strategy: { code: string; name: string; description: string };
  targetDrawDate: string;
  generatedAt: string;
  combinations: Candidate[];
  disclaimer: string;
}

export function PredictionsHub() {
  const { authFetch } = useAuth();
  const [selected, setSelected] = useState('STRATEGY_FREQUENCY');

  const strategies = useQuery<{ data: StrategyInfo[] }, ApiError>({
    queryKey: ['strategies'],
    queryFn: () => authFetch('/strategies'),
  });
  const list = useQuery<{ data: PredictionSummary[] }, ApiError>({
    queryKey: ['predictions'],
    queryFn: () => authFetch('/predictions'),
  });
  const currentId = list.data?.data.find((p) => p.strategy.code === selected)?.id;
  const detail = useQuery<PredictionDetail, ApiError>({
    queryKey: ['prediction', selected, currentId],
    queryFn: () => authFetch(`/predictions/${currentId}`),
    enabled: Boolean(currentId),
    retry: false,
  });

  const visible = new Set(list.data?.data.map((p) => p.strategy.code) ?? []);
  const enabled = (strategies.data?.data ?? []).filter((s) => s.isEnabled);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Combinaisons candidates</h1>
      <p className="max-w-2xl text-sm text-ink-2">
        Chaque stratégie génère 10 combinaisons candidates à partir des données historiques, avec
        un score décomposé et une explication. Toutes seront comparées à la sélection aléatoire
        par backtesting — en toute transparence.
      </p>
      <DisclaimerBanner />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Stratégies">
        {enabled.map((s) => {
          const locked = !visible.has(s.code);
          return (
            <button
              key={s.code}
              role="tab"
              aria-selected={selected === s.code}
              onClick={() => setSelected(s.code)}
              title={s.description}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                selected === s.code
                  ? 'border-accent bg-accent text-white'
                  : locked
                    ? 'border-border text-ink-3'
                    : 'border-border text-ink-2 hover:border-accent'
              }`}
            >
              {s.name}
              {locked ? ' 🔒' : ''}
            </button>
          );
        })}
      </div>

      {list.isLoading || strategies.isLoading ? (
        <p className="py-8 text-center text-ink-2">Chargement…</p>
      ) : !visible.has(selected) ? (
        <UpsellCard
          message={`La stratégie « ${
            enabled.find((s) => s.code === selected)?.name ?? selected
          } » fait partie du plan supérieur. ${STR.upsell.body}`}
        />
      ) : detail.isLoading ? (
        <p className="py-8 text-center text-ink-2">Chargement…</p>
      ) : detail.error ? (
        detail.error.status === 403 ? (
          <UpsellCard message={detail.error.message} />
        ) : (
          <p className="py-8 text-center text-ink-2">{STR.dataUnavailable}</p>
        )
      ) : detail.data ? (
        <>
          <p className="text-sm text-ink-2">
            Pour les tirages du{' '}
            <strong>
              {new Date(detail.data.targetDrawDate).toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
              })}
            </strong>{' '}
            — générées le {new Date(detail.data.generatedAt).toLocaleString('fr-FR')} ·{' '}
            {detail.data.strategy.description}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {detail.data.combinations.map((c) => (
              <CandidateCard key={c.rank} candidate={c} />
            ))}
          </div>
        </>
      ) : (
        <p className="py-8 text-center text-ink-2">
          Aucune génération disponible pour le moment — revenez après le prochain tirage.
        </p>
      )}
    </div>
  );
}
