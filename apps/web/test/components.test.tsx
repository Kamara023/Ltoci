import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { DrawCard } from '@/components/DrawCard';
import { NumberBall } from '@/components/NumberBall';
import { StatTile } from '@/components/StatTile';

describe('NumberBall', () => {
  it('affiche le numéro', () => {
    render(<NumberBall number={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });
  it('porte le titre accessible', () => {
    render(<NumberBall number={7} variant="hot" title="12 apparitions" />);
    expect(screen.getByTitle('12 apparitions')).toBeInTheDocument();
  });
});

describe('DisclaimerBanner', () => {
  it('affiche l’avertissement statistique obligatoire', () => {
    render(<DisclaimerBanner />);
    expect(screen.getByRole('note')).toHaveTextContent('aléatoires et indépendants');
  });
  it('accepte le texte fourni par l’API', () => {
    render(<DisclaimerBanner text="Texte du serveur." />);
    expect(screen.getByRole('note')).toHaveTextContent('Texte du serveur.');
  });
});

describe('DrawCard', () => {
  it('affiche type, date et les deux ensembles de numéros', () => {
    render(
      <DrawCard
        draw={{
          id: 'x',
          date: '2026-08-13',
          drawType: { code: 'reveil', name: 'Reveil' },
          status: 'VALID',
          numbers: { WINNING: [4, 17, 33, 58, 89], MACHINE: [1, 2, 3, 4, 5] },
        }}
      />,
    );
    expect(screen.getByText('Reveil')).toBeInTheDocument();
    expect(screen.getByText('89')).toBeInTheDocument();
    expect(screen.getByText('Numéros gagnants')).toBeInTheDocument();
    expect(screen.getByText('Numéros machine')).toBeInTheDocument();
  });
});

describe('CandidateCard', () => {
  it('affiche numéros, score et explication', async () => {
    const { CandidateCard } = await import('@/components/CandidateCard');
    render(
      <CandidateCard
        candidate={{
          rank: 1,
          numbers: [4, 17, 33, 58, 89],
          score: 2.41,
          breakdown: { weighted: { frequency: 0.9, recency: 0.5 } },
          explanation: 'Rappel : chaque tirage est indépendant.',
        }}
      />,
    );
    expect(screen.getByText('89')).toBeInTheDocument();
    expect(screen.getByText(/score 2\.41/)).toBeInTheDocument();
    expect(screen.getByText(/indépendant/)).toBeInTheDocument();
    expect(screen.getByText('Fréquence')).toBeInTheDocument();
  });
});

describe('ForecastCard', () => {
  const base = {
    id: 'f1',
    drawType: { code: 'reveil', name: 'Réveil', scheduledTime: '10:00' },
    targetDate: '2026-08-14',
    generatedAt: '2026-08-13T10:00:00Z',
    lockedAt: '2026-08-13T10:00:00Z',
    top5: [
      {
        rank: 1,
        number: 7,
        score: 0.9123,
        confidence: 'forte' as const,
        factors: { dominants: [{ facteur: 'fréquence historique', valeur: 0.9 }] },
        consensusCount: 5,
      },
      {
        rank: 2,
        number: 23,
        score: 0.81,
        confidence: 'moyenne' as const,
        factors: { dominants: [] },
        consensusCount: 3,
      },
    ],
    top10: [] as never[],
  };

  it('affiche numéro, score, confiance, facteurs et heure de figeage', async () => {
    const { ForecastCard } = await import('@/components/ForecastsHub');
    render(<ForecastCard forecast={{ ...base, top10: base.top5 }} />);
    expect(screen.getByText('Réveil')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText(/score 0\.912/)).toBeInTheDocument();
    expect(screen.getByText('confiance forte')).toBeInTheDocument();
    expect(screen.getByText(/fréquence historique/)).toBeInTheDocument();
    expect(screen.getByText(/figée le/)).toBeInTheDocument();
  });

  it('évaluée : badge de hits et numéros retrouvés', async () => {
    const { ForecastCard } = await import('@/components/ForecastsHub');
    render(
      <ForecastCard
        forecast={{
          ...base,
          top10: base.top5,
          result: {
            actualNumbers: [7, 12, 40, 66, 88],
            hitsTop5: 1,
            hitsTop10: 1,
            matchedNumbers: [7],
          },
        }}
      />,
    );
    expect(screen.getByText('1/5')).toBeInTheDocument();
    expect(screen.getByText('sorti ✓')).toBeInTheDocument();
    expect(screen.getByText(/Numéros réellement sortis/)).toBeInTheDocument();
  });
});

describe('StatTile', () => {
  it('affiche libellé, valeur et détail', () => {
    render(<StatTile label="Historique" value="15 000+" detail="tirages" />);
    expect(screen.getByText('Historique')).toBeInTheDocument();
    expect(screen.getByText('15 000+')).toBeInTheDocument();
  });
});
