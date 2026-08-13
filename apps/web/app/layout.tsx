import type { Metadata } from 'next';
import './globals.css';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { STR } from '@/lib/strings';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: `${STR.appName} — analyse statistique du Loto Bonheur`,
    template: `%s · ${STR.appName}`,
  },
  description:
    'Résultats et analyse statistique du Loto Bonheur (LONACI, Côte d’Ivoire) : fréquences, retards, tendances. Les tirages sont aléatoires — aucune prédiction.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="flex min-h-screen flex-col antialiased">
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
