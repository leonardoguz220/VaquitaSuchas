import { render, screen } from '@testing-library/react';
import { RatingBadge } from './rating-badge';

describe('RatingBadge (RF-007-02, RNF-007-06)', () => {
  it('CA-007-02: con estrellas muestra el valor numérico «4,5 de 5» y el nivel en texto', () => {
    render(<RatingBadge rating={{ level: 'Bueno', stars: 4.5, starsLabel: '4,5 de 5' }} />);
    expect(screen.getByText('4,5 de 5')).toBeInTheDocument();
    expect(screen.getByText('Bueno')).toBeInTheDocument();
  });

  it('CA-007-02: el dibujo de las estrellas es decorativo y no se lee', () => {
    const { container } = render(
      <RatingBadge rating={{ level: 'Bueno', stars: 4.5, starsLabel: '4,5 de 5' }} />,
    );
    const icons = container.querySelectorAll('svg');
    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon) => expect(icon).toHaveAttribute('aria-hidden', 'true'));
  });

  it('CA-007-02: sin estrellas («Nuevo») muestra solo el nivel, sin valor numérico', () => {
    render(<RatingBadge rating={{ level: 'Nuevo', stars: null, starsLabel: null }} />);
    expect(screen.getByText('Nuevo')).toBeInTheDocument();
    expect(screen.queryByText(/de 5/)).not.toBeInTheDocument();
  });

  it('RNF-007-06: si la API no trae starsLabel, el valor se escribe con coma decimal desde stars', () => {
    render(<RatingBadge rating={{ level: 'Regular', stars: 3.5, starsLabel: null }} />);
    expect(screen.getByText('3,5 de 5')).toBeInTheDocument();
    expect(screen.getByText('Regular')).toBeInTheDocument();
  });

  it('RF-007-02: el nivel sale con ícono y texto, no solo con color', () => {
    render(<RatingBadge rating={{ level: 'En riesgo', stars: 2, starsLabel: '2 de 5' }} />);
    const level = screen.getByText('En riesgo');
    expect(level.closest('span')?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
