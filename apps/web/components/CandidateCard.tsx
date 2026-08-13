import { NumberBall } from './NumberBall';

export interface Candidate {
  rank: number;
  numbers: number[];
  score: number;
  breakdown: {
    weighted?: Record<string, number>;
    penalties?: Record<string, number>;
  };
  explanation: string;
}

const COMPONENT_LABELS: Record<string, string> = {
  frequency: 'Fréquence',
  recency: 'Récence',
  cooccurrence: 'Cooccurrence',
  odd_even_balance: 'Pair/impair',
  high_low_balance: 'Haut/bas',
  dispersion: 'Dispersion',
};

/** Carte d'une combinaison candidate : numéros, score décomposé, explication. */
export function CandidateCard({ candidate }: { candidate: Candidate }) {
  const weighted = Object.entries(candidate.breakdown.weighted ?? {}).filter(([, v]) => v > 0);
  const maxWeight = Math.max(0.0001, ...weighted.map(([, v]) => v));
  return (
    <article className="rounded-lg border border-border bg-surface-2 p-4">
      <header className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">
          Candidate #{candidate.rank}
        </span>
        <span className="rounded-md bg-accent-soft px-2 py-0.5 text-sm font-bold tabular-nums text-accent">
          score {candidate.score.toFixed(2)}
        </span>
      </header>
      <div className="mb-3 flex flex-wrap gap-2">
        {candidate.numbers.map((n) => (
          <NumberBall key={n} number={n} size="lg" variant="hot" />
        ))}
      </div>
      {weighted.length ? (
        <dl className="mb-3 space-y-1">
          {weighted.map(([name, value]) => (
            <div key={name} className="flex items-center gap-2 text-xs">
              <dt className="w-24 shrink-0 text-ink-3">{COMPONENT_LABELS[name] ?? name}</dt>
              <dd className="h-2 flex-1 rounded-full bg-surface">
                <div
                  className="h-2 rounded-full bg-accent"
                  style={{ width: `${Math.round((value / maxWeight) * 100)}%` }}
                />
              </dd>
              <span className="w-10 text-right tabular-nums text-ink-2">{value.toFixed(2)}</span>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="text-xs leading-relaxed text-ink-2">{candidate.explanation}</p>
    </article>
  );
}
