'use client';

/** Bandeau d'erreur commun : plus jamais de zéros silencieux. */
export function QueryError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const message =
    error instanceof Error ? error.message : 'Impossible de joindre l’API — vérifiez le service.';
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-err/40 bg-err-soft px-4 py-3 text-sm"
    >
      <span>
        <strong>Erreur de chargement.</strong> {message}
      </span>
      <button
        onClick={onRetry}
        className="rounded-md border border-err px-3 py-1 text-xs font-semibold text-err"
      >
        Réessayer
      </button>
    </div>
  );
}
