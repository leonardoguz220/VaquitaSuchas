import { render, screen } from '@testing-library/react';
import { RatingBadge, starFills } from './rating-badge';

function fills(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('svg[data-fill]')).map(
    (icon) => icon.getAttribute('data-fill') ?? '',
  );
}

describe('RatingBadge (spec 007 T015)', () => {
  it('CA-007-01: 4,5 estrellas «Bueno» se ven con estrellas, «4,5 de 5» y el nivel en texto', () => {
    const { container } = render(
      <RatingBadge rating={{ level: 'Bueno', stars: 4.5, starsLabel: '4,5 de 5' }} />,
    );
    expect(screen.getByText('4,5 de 5')).toBeVisible();
    expect(screen.getByText('Nivel: Bueno')).toBeVisible();
    expect(fills(container)).toEqual(['full', 'full', 'full', 'full', 'half']);
  });

  it('RNF-007-06: las estrellas dibujadas son decorativas; el valor y el nivel se leen como texto', () => {
    const { container } = render(
      <RatingBadge rating={{ level: 'Excelente', stars: 5, starsLabel: '5 de 5' }} />,
    );
    const stars = container.querySelector('svg[data-fill]')?.parentElement;
    expect(stars).toHaveAttribute('aria-hidden', 'true');
    expect(container).toHaveTextContent('5 de 5Nivel: Excelente');
  });

  it('RNF-007-06: cada nivel tiene un icono distinto además del color', () => {
    const levels = ['Excelente', 'Bueno', 'Regular', 'En riesgo', 'Nuevo'] as const;
    const icons = levels.map((level) => {
      const { container, unmount } = render(
        <RatingBadge rating={{ level, stars: level === 'Nuevo' ? null : 3, starsLabel: null }} />,
      );
      const badge = screen.getByText(level === 'Nuevo' ? 'Nuevo' : `Nivel: ${level}`);
      const path = badge.querySelector('svg path')?.getAttribute('d');
      expect(container).toContainElement(badge);
      unmount();
      return path;
    });
    expect(new Set(icons).size).toBe(levels.length);
  });

  it('CA-007-02: con nivel «Nuevo» no hay estrellas y lo dice en texto', () => {
    const { container } = render(<RatingBadge rating={{ level: 'Nuevo', stars: null }} />);
    expect(screen.getByText('Nuevo')).toBeVisible();
    expect(screen.getByText('Sin estrellas todavía')).toBeVisible();
    expect(fills(container)).toEqual([]);
  });

  it('RF-007-01: sin starsLabel muestra el número de la API con coma decimal', () => {
    render(<RatingBadge rating={{ level: 'Regular', stars: 3.5 }} />);
    expect(screen.getByText('3,5 de 5')).toBeVisible();
  });

  it('RF-007-01: starFills solo dibuja el valor recibido en pasos de media estrella', () => {
    expect(starFills(0)).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
    expect(starFills(2.5)).toEqual(['full', 'full', 'half', 'empty', 'empty']);
    expect(starFills(5)).toEqual(['full', 'full', 'full', 'full', 'full']);
  });
});
