/**
 * Boule de loto : un numéro 1–90.
 * Variantes : default (neutre), hot (fréquent), cold (peu fréquent),
 * late (retard élevé). L'identité n'est jamais portée par la couleur seule :
 * le contexte (titre de section) nomme toujours la variante.
 */
export type BallVariant = 'default' | 'hot' | 'cold' | 'late';

const styles: Record<BallVariant, string> = {
  default: 'bg-surface-2 text-ink border-border',
  hot: 'bg-hot-soft text-hot border-hot',
  cold: 'bg-cold-soft text-cold border-cold',
  late: 'bg-surface-2 text-ink border-dashed border-ink-3',
};

export function NumberBall({
  number,
  variant = 'default',
  size = 'md',
  title,
}: {
  number: number;
  variant?: BallVariant;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}) {
  const sizes = { sm: 'h-7 w-7 text-xs', md: 'h-9 w-9 text-sm', lg: 'h-11 w-11 text-base' };
  return (
    <span
      title={title}
      className={`inline-flex items-center justify-center rounded-full border font-semibold tabular-nums ${sizes[size]} ${styles[variant]}`}
    >
      {number}
    </span>
  );
}
