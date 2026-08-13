import { DisclaimerBanner } from '@/components/DisclaimerBanner';

export const metadata = { title: 'Méthodologie' };

export default function MethodologyPage() {
  return (
    <article className="prose-sm mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Méthodologie & limites</h1>
      <DisclaimerBanner />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">D’où viennent les données ?</h2>
        <p className="text-ink-2">
          Les résultats sont collectés automatiquement toutes les heures depuis les publications
          officielles du Loto Bonheur, depuis octobre 2020. Chaque tirage passe par un pipeline de
          contrôle qualité (doublons, numéros hors plage, incohérences) et seuls les tirages
          validés alimentent les statistiques. La source et la date de collecte de chaque tirage
          sont conservées et affichées.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Ce que les statistiques peuvent dire</h2>
        <p className="text-ink-2">
          Fréquences, retards, paires, tendances : ces indicateurs décrivent fidèlement le passé.
          Ils permettent d’explorer l’historique, de comparer des périodes et de comprendre la
          distribution réelle des tirages.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Ce qu’elles ne peuvent PAS dire</h2>
        <p className="text-ink-2">
          Si le tirage est équitable, chaque combinaison de 5 numéros parmi 90 a exactement la
          même probabilité à chaque tirage : 1 sur 43 949 268 — quel que soit l’historique. Un
          numéro « en retard » n’est pas « dû » (c’est le sophisme du joueur) ; un numéro
          « chaud » n’est pas « en forme ». En jouant 5 numéros, l’espérance mathématique est
          d’environ 0,28 bon numéro par tirage — aucune stratégie statistique ne peut changer ces
          probabilités.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Notre engagement de transparence</h2>
        <p className="text-ink-2">
          Nous n’affichons jamais un score comme une « probabilité de gagner ». Les futures
          fonctionnalités de combinaisons candidates seront systématiquement comparées à une
          sélection aléatoire par backtesting, et les résultats publiés — y compris quand ils
          montrent qu’aucune stratégie ne bat le hasard, ce qui est le résultat attendu sur un
          tirage équitable.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Jeu responsable</h2>
        <p className="text-ink-2">
          Le jeu doit rester un divertissement. Ne jouez jamais d’argent dont vous avez besoin,
          fixez-vous des limites, et sachez demander de l’aide en cas de perte de contrôle.
        </p>
      </section>
    </article>
  );
}
