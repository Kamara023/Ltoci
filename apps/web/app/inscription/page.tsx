import Link from 'next/link';
import { AuthForm } from '@/components/AuthForm';

export const metadata = { title: 'Inscription' };

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-center text-2xl font-bold">Créer un compte</h1>
      <p className="mx-auto max-w-md text-center text-sm text-ink-2">
        Gratuit : historique 30 jours et statistiques de base. Le plan Premium débloque
        l’historique complet, les retards, paires et tendances.
      </p>
      <AuthForm mode="register" />
      <p className="text-center text-sm text-ink-2">
        Déjà inscrit ?{' '}
        <Link href="/connexion" className="text-accent underline">
          Connectez-vous
        </Link>
      </p>
    </div>
  );
}
