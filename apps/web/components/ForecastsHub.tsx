'use client';

/**
 * Prévisions TOP 5 par tirage à venir (outil de recherche — plan PRO).
 * Trois vues : prochains tirages (prévisions FIGÉES avant tirage),
 * historique évalué (hits 0/5→5/5 vs résultat réel), performance réelle
 * accumulée vs baseline aléatoire. Le gating est appliqué par l'API — un
 * 403 affiche l'UpsellCard. Aucun score n'est une probabilité de gain.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { STR } from '@/lib/strings';
import { ApiError } from '@/lib/types';
import { DisclaimerBanner } from './DisclaimerBanner';
import { NumberBall } from './NumberBall';
import { UpsellCard } from './UpsellCard';

interface ForecastEntry {
  rank: number;
  number: number;
  score: number;
  confidence: 'faible' | 'moyenne' | 'forte';
  factors: { dominants?: Array<{ facteur: string; valeur: number }> };
  consensusCount: number;
}

export interface Forecast {
  id: string;
  drawType: { code: string; name: string; scheduledTime: string | null };
  targetDate: string;
  generatedAt: string;
  lockedAt: string;
  top5: ForecastEntry[];
  top10: ForecastEntry[];
  result?: {
    actualNumbers: number[];
    hitsTop5: number;
    hitsTop10: number;
    matchedNumbers: number[];
  } | null;
}

interface Performance {
  evaluated: number;
  hitsTop5Distribution: Record<string, number>;
  avgHitsTop5: number | null;
  avgHitsTop10: number | null;
  randomBaselineTop5: number;
  byDrawType: Array<{
    code: string;
    name: string;
    evaluated: number;
    avgHitsTop5: number;
    avgHitsTop10: number;
  }>;
}

const CONFIDENCE_STYLE: Record<string, string> = {
  forte: 'bg-hot-soft text-hot border-hot',
  moyenne: 'bg-accent-soft text-accent border-accent',
  faible: 'bg-surface-2 text-ink-2 border-border',
};

function ConfidenceBadge({ level }: { level: string }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
        CONFIDENCE_STYLE[level] ?? CONFIDENCE_STYLE.faible
      }`}
    >
      confiance {level}
    </span>
  );
}

function HitsBadge({ hits, of }: { hits: number; of: number }) {
  const strong = hits >= 3;
  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-sm font-bold tabular-nums ${
        strong
          ? 'border-hot bg-hot-soft text-hot'
          : hits > 0
            ? 'border-accent bg-accent-soft text-accent'
            : 'border-border bg-surface-2 text-ink-2'
      }`}
    >
      {hits}/{of}
    </span>
  );
}

export function ForecastCard({ forecast }: { forecast: Forecast }) {
  const [showTop10, setShowTop10] = useState(false);
  const entries = showTop10 ? forecast.top10 : forecast.top5;
  const matched = new Set(forecast.result?.matchedNumbers ?? []);
  const actual = new Set(forecast.result?.actualNumbers ?? []);
  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{forecast.drawType.name}</h3>
        <span className="text-sm text-ink-2">
          {new Date(forecast.targetDate).toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
          })}
          {forecast.drawType.scheduledTime ? ` · ${forecast.drawType.scheduledTime}` : ''}
        </span>
        {forecast.result ? (
          <span className="ml-auto flex items-center gap-2">
            <HitsBadge hits={forecast.result.hitsTop5} of={5} />
            <span className="text-xs text-ink-3">
              (TOP 10 : {forecast.result.hitsTop10}/5)
            </span>
          </span>
        ) : (
          <span className="ml-auto text-xs text-ink-3">
            figée le {new Date(forecast.lockedAt).toLocaleString('fr-FR')}
          </span>
        )}
      </div>

      <ul className="mt-3 space-y-2">
        {entries.map((e) => (
          <li key={e.rank} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-6 text-right text-xs tabular-nums text-ink-3">#{e.rank}</span>
            <NumberBall
              number={e.number}
              variant={
                forecast.result
                  ? actual.has(e.number)
                    ? 'hot'
                    : 'default'
                  : e.confidence === 'forte'
                    ? 'hot'
                    : 'default'
              }
              title={`score ${e.score.toFixed(4)}`}
            />
            <span className="tabular-nums text-ink-2">score {e.score.toFixed(3)}</span>
            <ConfidenceBadge level={e.confidence} />
            <span className="text-xs text-ink-3">
              {e.consensusCount} modèle{e.consensusCount > 1 ? 's' : ''} d&apos;accord
              {e.factors?.dominants?.length
                ? ` · ${e.factors.dominants.map((f) => f.facteur).join(', ')}`
                : ''}
            </span>
            {forecast.result && matched.has(e.number) && e.rank <= 5 ? (
              <span className="text-xs font-semibold text-hot">sorti ✓</span>
            ) : null}
          </li>
        ))}
      </ul>

      {forecast.result ? (
        <p className="mt-3 text-xs text-ink-2">
          Numéros réellement sortis :{' '}
          <span className="tabular-nums">
            {forecast.result.actualNumbers.join(' · ')}
          </span>
        </p>
      ) : null}

      <button
        onClick={() => setShowTop10((v) => !v)}
        className="mt-3 text-xs font-medium text-accent hover:underline"
      >
        {showTop10 ? 'Réduire au TOP 5' : 'Voir le TOP 10'}
      </button>
    </article>
  );
}

export function ForecastsHub() {
  const { authFetch } = useAuth();
  const [tab, setTab] = useState<'next' | 'history' | 'performance'>('next');

  const next = useQuery<{ data: Forecast[] }, ApiError>({
    queryKey: ['forecasts-next'],
    queryFn: () => authFetch('/forecasts/next'),
    retry: false,
  });
  const history = useQuery<{ data: Forecast[] }, ApiError>({
    queryKey: ['forecasts-history'],
    queryFn: () => authFetch('/forecasts/history?limit=60'),
    enabled: tab === 'history',
    retry: false,
  });
  const performance = useQuery<Performance, ApiError>({
    queryKey: ['forecasts-performance'],
    queryFn: () => authFetch('/forecasts/performance'),
    enabled: tab === 'performance',
    retry: false,
  });

  const TABS = [
    { key: 'next' as const, label: 'Prochains tirages' },
    { key: 'history' as const, label: 'Historique évalué' },
    { key: 'performance' as const, label: 'Performance réelle' },
  ];

  const forbidden =
    next.error?.status === 403 || history.error?.status === 403 || performance.error?.status === 403;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Prévisions TOP 5 par tirage</h1>
      <p className="max-w-2xl text-sm text-ink-2">
        Pour chaque tirage à venir, le consensus des stratégies réduit les 90 numéros à un TOP 10
        puis un TOP 5, avec score, confiance et facteurs. Chaque prévision est <strong>figée</strong>{' '}
        avant le tirage puis comparée automatiquement au résultat réel — la performance accumulée
        est toujours lue face à la baseline aléatoire (≈ 0,28 numéro retrouvé par TOP 5 en moyenne).
      </p>
      <DisclaimerBanner />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Vues">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              tab === t.key
                ? 'border-accent bg-accent text-white'
                : 'border-border text-ink-2 hover:border-accent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {forbidden ? (
        <UpsellCard
          message={`Les prévisions TOP 5 par tirage font partie du plan PRO. ${STR.upsell.body}`}
        />
      ) : tab === 'next' ? (
        next.isLoading ? (
          <p className="py-8 text-center text-ink-2">Chargement…</p>
        ) : next.data?.data.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {next.data.data.map((f) => (
              <ForecastCard key={f.id} forecast={f} />
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-ink-2">
            Aucune prévision active — elles sont générées automatiquement après chaque collecte.
          </p>
        )
      ) : tab === 'history' ? (
        history.isLoading ? (
          <p className="py-8 text-center text-ink-2">Chargement…</p>
        ) : history.data?.data.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {history.data.data.map((f) => (
              <ForecastCard key={f.id} forecast={f} />
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-ink-2">
            Pas encore de prévision évaluée — la première comparaison aura lieu automatiquement
            après le prochain tirage collecté.
          </p>
        )
      ) : performance.isLoading ? (
        <p className="py-8 text-center text-ink-2">Chargement…</p>
      ) : performance.data ? (
        <PerformanceView perf={performance.data} />
      ) : (
        <p className="py-8 text-center text-ink-2">{STR.dataUnavailable}</p>
      )}
    </div>
  );
}

function PerformanceView({ perf }: { perf: Performance }) {
  if (!perf.evaluated) {
    return (
      <p className="py-8 text-center text-ink-2">
        Aucune évaluation encore — la performance réelle s&apos;accumulera tirage après tirage.
      </p>
    );
  }
  const maxCount = Math.max(...Object.values(perf.hitsTop5Distribution), 1);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-ink-3">Prévisions évaluées</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{perf.evaluated}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-ink-3">Hits moyens (TOP 5)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{perf.avgHitsTop5?.toFixed(3)}</p>
          <p className="text-xs text-ink-2">
            baseline aléatoire : {perf.randomBaselineTop5.toFixed(3)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-ink-3">Hits moyens (TOP 10)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{perf.avgHitsTop10?.toFixed(3)}</p>
          <p className="text-xs text-ink-2">baseline aléatoire : 0,556</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Distribution des hits TOP 5 (réel)</h3>
        <div className="mt-3 space-y-1.5">
          {['0', '1', '2', '3', '4', '5'].map((k) => {
            const v = perf.hitsTop5Distribution[k] ?? 0;
            return (
              <div key={k} className="flex items-center gap-2 text-sm">
                <span className="w-8 text-right tabular-nums text-ink-2">{k}/5</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-surface-2">
                  <div
                    className="h-full rounded bg-accent"
                    style={{ width: `${(v / maxCount) * 100}%` }}
                  />
                </div>
                <span className="w-10 tabular-nums text-ink-2">{v}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-ink-2">
          Les 4/5 et 5/5 sont statistiquement rarissimes — l&apos;objectif de l&apos;outil est de
          mesurer honnêtement, jamais de garantir.
        </p>
      </div>

      {perf.byDrawType.length ? (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="font-semibold">Par type de tirage</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-3">
                  <th className="py-1.5 pr-3">Tirage</th>
                  <th className="py-1.5 pr-3 text-right">Évaluées</th>
                  <th className="py-1.5 pr-3 text-right">Hits moy. TOP 5</th>
                  <th className="py-1.5 text-right">Hits moy. TOP 10</th>
                </tr>
              </thead>
              <tbody>
                {perf.byDrawType.map((t) => (
                  <tr key={t.code} className="border-b border-border/50">
                    <td className="py-1.5 pr-3">{t.name}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{t.evaluated}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {t.avgHitsTop5.toFixed(3)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{t.avgHitsTop10.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
