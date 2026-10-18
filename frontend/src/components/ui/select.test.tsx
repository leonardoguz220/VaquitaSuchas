import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './select';

function ServiceSelect(props: { error?: string }) {
  return (
    <Select
      label="Servicio"
      hint="Elige del catálogo."
      placeholder="Elige un servicio"
      defaultValue=""
      {...props}
    >
      <option value="netflix">Netflix</option>
      <option value="spotify">Spotify</option>
    </Select>
  );
}

describe('Select (RF-000-16)', () => {
  it('RF-000-16: es un selector nativo con etiqueta asociada y ayuda', () => {
    render(<ServiceSelect />);
    const select = screen.getByRole('combobox', { name: 'Servicio' });
    expect(select).toHaveAccessibleDescription('Elige del catálogo.');
    expect(screen.getByRole('option', { name: 'Elige un servicio' })).toHaveValue('');
  });

  it('RF-000-16: permite elegir una opción con el teclado o el puntero', async () => {
    render(<ServiceSelect />);
    const select = screen.getByRole('combobox', { name: 'Servicio' });
    await userEvent.setup().selectOptions(select, 'spotify');
    expect(select).toHaveValue('spotify');
  });

  it('RF-000-16: el error marca aria-invalid y describe el selector', () => {
    render(<ServiceSelect error="Elige un servicio para continuar." />);
    const select = screen.getByRole('combobox', { name: 'Servicio' });
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription(
      'Elige del catálogo. Elige un servicio para continuar.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Elige un servicio para continuar.');
  });
});
