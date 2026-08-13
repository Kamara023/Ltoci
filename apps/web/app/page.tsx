import Link from 'next/link';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { DrawCard } from '@/components/DrawCard';
import { NumberBall } from '@/components/NumberBall';
import { StatTile } from '@/components/StatTile';
import { tryFetch } from '@/lib/api';
import { STR } from '@/lib/strings';
import { DrawDto, NumberStatsResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [latest, hot] = await Promise.all([
    tryFetch<{ data: DrawDto[] }>('/draws/latest'),
    tryFetch<NumberStatsResponse>('/statistics/hot?window=LAST_20&limit=5'),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const todayDraws = latest?.data.filter((d) => d.date === today) ?? [];
  const displayed = todayDraws.length ? todayDraws : (latest?.data.slice(0, 6) ?? []);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold">{STR.tagline}</h1>
        <p className="max-w-2xl text-ink-2">
          Historique complet des tirages du Loto Bonheur depuis octobre 2020, statistiques
          détaillées et analyses honnêtes — ce que les chiffres disent, et ce qu’ils ne peuvent
          pas dire.
        </p>
        <DisclaimerBanner />
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">
            {todayDraws.length ? 'Tirages du jour' : 'Derniers tirages'}
          </h2>
          <Link href="/resultats" className="text-sm text-accent underline">
            Tout l’historique →
          </Link>
        </div>
        {displayed.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {displayed.map((d) => (
              <DrawCard key={d.id} draw={d} href={`/resultats/${d.id}`} />
            ))}
          </div>
        ) : (
          <p className="text-ink-2">{STR.dataUnavailable}</p>
        )}
      </section>

      {hot ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            Numéros les plus fréquents — {STR.windows[hot.meta.window]}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {hot.data.map((s) => (
              <NumberBall
                key={s.number}
                number={s.number}
                variant="hot"
                size="lg"
                title={`${s.frequency} apparitions`}
              />
            ))}
            <Link href="/statistiques" className="ml-2 text-sm text-accent underline">
              Toutes les statistiques →
            </Link>
          </div>
          {hot.disclaimer ? (
            <p className="text-xs text-ink-3">{hot.disclaimer}</p>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Historique" value="15 000+" detail="tirages depuis octobre 2020" />
        <StatTile label="Tirages quotidiens" value="39" detail="types de tirage suivis" />
        <StatTile label="Mise à jour" value="Toutes les heures" detail="collecte automatique" />
      </section>

      <section className="rounded-lg border border-border bg-surface-2 p-6 text-center">
        <h2 className="text-lg font-semibold">Envie d’aller plus loin ?</h2>
        <p className="mx-auto mt-1 max-w-lg text-sm text-ink-2">
          Créez un compte gratuit, puis débloquez les retards, paires fréquentes, tendances et
          fenêtres longues avec le plan Premium.
        </p>
        <Link
          href="/inscription"
          className="mt-4 inline-block rounded-md bg-accent px-5 py-2 font-semibold text-white"
        >
          Créer un compte
        </Link>
      </section>
    </div>
  );
}
