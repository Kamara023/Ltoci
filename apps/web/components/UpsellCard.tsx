'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { STR } from '@/lib/strings';

/** Présentation propre d'une fonctionnalité hors plan (403 de l'API).
 * Le texte s'adapte : un visiteur est invité à créer un compte, un
 * utilisateur connecté est informé que le plan supérieur arrive bientôt. */
export function UpsellCard({ message }: { message?: string }) {
  const { user, ready } = useAuth();
  const loggedIn = ready && Boolean(user);
  return (
    <div className="rounded-lg border border-accent/40 bg-accent-soft p-6 text-center">
      <p className="text-lg font-semibold">{STR.upsell.title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">{message ?? STR.upsell.body}</p>
      {loggedIn ? (
        <p className="mx-auto mt-3 max-w-md text-sm text-ink-2">
          Le passage au plan supérieur arrive bientôt (paiement Mobile Money) — votre plan actuel
          est visible sur{' '}
          <Link href="/compte" className="font-semibold text-accent hover:underline">
            votre compte
          </Link>
          .
        </p>
      ) : (
        <Link
          href="/inscription"
          className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          {STR.upsell.cta}
        </Link>
      )}
    </div>
  );
}
