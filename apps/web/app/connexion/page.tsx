import Link from 'next/link';
import { AuthForm } from '@/components/AuthForm';

export const metadata = { title: 'Connexion' };

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-center text-2xl font-bold">Connexion</h1>
      <AuthForm mode="login" />
      <p className="text-center text-sm text-ink-2">
        Pas encore de compte ?{' '}
        <Link href="/inscription" className="text-accent underline">
          Inscrivez-vous gratuitement
        </Link>
      </p>
    </div>
  );
}
