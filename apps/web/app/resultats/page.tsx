import Link from 'next/link';
import { DrawCard } from '@/components/DrawCard';
import { tryFetch } from '@/lib/api';
import { STR } from '@/lib/strings';
import { GameDto, PaginatedDraws } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Résultats' };

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const type = params.type ?? '';

  const query = new URLSearchParams({ page: String(page), limit: '12' });
  if (type) query.set('drawTypeCode', type);

  const [draws, game] = await Promise.all([
    tryFetch<PaginatedDraws>(`/draws?${query}`),
    tryFetch<GameDto>('/games/loto-bonheur'),
  ]);

  const totalPages = draws ? Math.max(1, Math.ceil(draws.meta.total / draws.meta.limit)) : 1;
  const pageHref = (p: number) =>
    `/resultats?${new URLSearchParams({ ...(type ? { type } : {}), page: String(p) })}`;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Résultats des tirages</h1>

      <form className="flex flex-wrap items-center gap-2" action="/resultats" method="get">
        <label htmlFor="type" className="text-sm text-ink-2">
          Type de tirage
        </label>
        <select
          id="type"
          name="type"
          defaultValue={type}
          className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm"
        >
          <option value="">Tous les tirages</option>
          {game?.drawTypes.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="rounded-md border border-accent px-3 py-1.5 text-sm font-semibold text-accent">
          Filtrer
        </button>
      </form>

      {draws?.historyLimitedToDays ? (
        <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink-2">
          Historique limité aux {draws.historyLimitedToDays} derniers jours avec votre plan —{' '}
          <Link href="/inscription" className="text-accent underline">
            débloquez l’historique complet
          </Link>
          .
        </p>
      ) : null}

      {draws?.data.length ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {draws.data.map((d) => (
              <DrawCard key={d.id} draw={d} href={`/resultats/${d.id}`} />
            ))}
          </div>
          <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="text-accent underline">
                ← Page précédente
              </Link>
            ) : (
              <span />
            )}
            <span className="tabular-nums text-ink-2">
              Page {page} / {totalPages} · {draws.meta.total} tirages
            </span>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="text-accent underline">
                Page suivante →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </>
      ) : (
        <p className="text-ink-2">{STR.dataUnavailable}</p>
      )}
    </div>
  );
}
