'use client';

/**
 * Fréquences des 90 numéros — barres fines, série UNIQUE (magnitude →
 * une seule teinte, pas de légende : le titre de section nomme la série).
 * Conforme au skill dataviz : marques fines à bouts arrondis ancrées à la
 * base, grille discrète, tooltip au survol, texte en jetons d'encre.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { NumberStatDto } from '@/lib/types';

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: NumberStatDto }[];
}) {
  if (!active || !payload?.length) return null;
  const stat = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold">Numéro {stat.number}</p>
      <p className="tabular-nums text-ink-2">
        {stat.frequency} apparition{stat.frequency > 1 ? 's' : ''}
        {stat.currentGap !== undefined ? ` · retard ${stat.currentGap}` : ''}
      </p>
    </div>
  );
}

export function FrequencyChart({
  data,
  highlight,
}: {
  data: NumberStatDto[];
  highlight?: number[];
}) {
  const highlightSet = new Set(highlight ?? []);
  return (
    <div className="h-64 w-full" role="img" aria-label="Fréquence d’apparition de chaque numéro">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
          <XAxis
            dataKey="number"
            tick={{ fill: 'var(--ink-3)', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            interval={9}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: 'var(--ink-3)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--accent-soft)' }} />
          <Bar dataKey="frequency" radius={[3, 3, 0, 0]} maxBarSize={8}>
            {data.map((d) => (
              <Cell
                key={d.number}
                fill={highlightSet.has(d.number) ? 'var(--hot)' : 'var(--accent)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
