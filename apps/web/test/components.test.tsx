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

describe('StatTile', () => {
  it('affiche libellé, valeur et détail', () => {
    render(<StatTile label="Historique" value="15 000+" detail="tirages" />);
    expect(screen.getByText('Historique')).toBeInTheDocument();
    expect(screen.getByText('15 000+')).toBeInTheDocument();
  });
});
