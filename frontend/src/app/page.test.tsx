import { render, screen } from '@testing-library/react';
import HomePage from './page';

describe('HomePage (humo T005)', () => {
  it('muestra el nombre de la aplicación en español', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Vaquita' })).toBeInTheDocument();
    expect(screen.getByText('Organiza tus suscripciones compartidas.')).toBeInTheDocument();
  });
});
