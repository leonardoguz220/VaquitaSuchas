import { render, screen } from '@testing-library/react';
import { Card } from './card';

describe('Card (RF-000-16)', () => {
  it('RF-000-16: muestra su contenido con borde line, fondo surface y radio de tarjeta', () => {
    render(<Card data-testid="card">Netflix familiar</Card>);
    const card = screen.getByTestId('card');
    expect(card).toHaveTextContent('Netflix familiar');
    expect(card).toHaveClass('rounded-card', 'border-line', 'bg-surface');
  });

  it('RF-000-16: puede ser una sección con nombre accesible', () => {
    render(
      <Card as="section" aria-labelledby="t">
        <h2 id="t">Backend</h2>
      </Card>,
    );
    expect(screen.getByRole('region', { name: 'Backend' })).toBeInTheDocument();
  });
});
