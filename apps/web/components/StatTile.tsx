/** Tuile de statistique : un chiffre-clé, son libellé, un détail optionnel. */
export function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-4">
      <p className="text-xs uppercase tracking-wide text-ink-3">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {detail ? <p className="mt-1 text-xs text-ink-2">{detail}</p> : null}
    </div>
  );
}
