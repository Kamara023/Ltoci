import Link from 'next/link';
import { DrawDto } from '@/lib/types';
import { STR } from '@/lib/strings';
import { NumberBall } from './NumberBall';

/** Carte d'un tirage : type, date, numéros gagnants + machine. */
export function DrawCard({ draw, href }: { draw: DrawDto; href?: string }) {
  const body = (
    <article className="rounded-lg border border-border bg-surface-2 p-4 transition hover:border-accent">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{draw.drawType.name}</h3>
        <time className="text-sm text-ink-2 tabular-nums" dateTime={draw.date}>
          {new Date(draw.date).toLocaleDateString('fr-FR', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </time>
      </header>
      {(['WINNING', 'MACHINE'] as const).map((set) =>
        draw.numbers[set] ? (
          <div key={set} className="mb-2 flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-ink-3">{STR.sets[set]}</span>
            <div className="flex flex-wrap gap-1.5">
              {draw.numbers[set].map((n) => (
                <NumberBall key={n} number={n} size="sm" variant={set === 'WINNING' ? 'default' : 'cold'} />
              ))}
            </div>
          </div>
        ) : null,
      )}
    </article>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
