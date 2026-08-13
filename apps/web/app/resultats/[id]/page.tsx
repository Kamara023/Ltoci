import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NumberBall } from '@/components/NumberBall';
import { tryFetch } from '@/lib/api';
import { STR } from '@/lib/strings';
import { DrawDto } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Détail du tirage' };

type DrawDetail = DrawDto & { source: string; collectedAt: string };

export default async function DrawDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const draw = await tryFetch<DrawDetail>(`/draws/${id}`);
  if (!draw) notFound();

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link href="/resultats" className="text-accent underline">
          ← Tous les résultats
        </Link>
      </nav>
      <header>
        <h1 className="text-2xl font-bold">{draw.drawType.name}</h1>
        <p className="text-ink-2">
          {new Date(draw.date).toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </header>

      {(['WINNING', 'MACHINE'] as const).map((set) =>
        draw.numbers[set] ? (
          <section key={set}>
            <h2 className="mb-2 font-semibold">{STR.sets[set]}</h2>
            <div className="flex flex-wrap gap-2">
              {draw.numbers[set].map((n) => (
                <NumberBall key={n} number={n} size="lg" variant={set === 'WINNING' ? 'hot' : 'cold'} />
              ))}
            </div>
          </section>
        ) : null,
      )}
      {!draw.numbers['MACHINE'] ? (
        <p className="text-sm text-ink-3">Numéros machine non publiés par la source pour ce tirage.</p>
      ) : null}

      <footer className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-ink-3">
        Source : {draw.source} · collecté le{' '}
        {new Date(draw.collectedAt).toLocaleString('fr-FR')} · statut : validé
      </footer>
    </div>
  );
}
