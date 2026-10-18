import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field } from './field';

describe('Field (RF-000-16)', () => {
  it('RF-000-16: la etiqueta queda asociada al campo', async () => {
    render(<Field label="Correo" type="email" />);
    const input = screen.getByLabelText('Correo');
    expect(input).toHaveAttribute('type', 'email');

    await userEvent.setup().click(screen.getByText('Correo'));
    expect(input).toHaveFocus();
  });

  it('RF-000-16: la ayuda describe el campo con aria-describedby', () => {
    render(<Field label="Cédula de identidad" hint="Solo números, sin extensión." />);
    const input = screen.getByRole('textbox', { name: 'Cédula de identidad' });
    expect(input).toHaveAccessibleDescription('Solo números, sin extensión.');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('RF-000-16: el error marca aria-invalid, describe el campo y se anuncia', () => {
    render(
      <Field
        label="Correo"
        hint="Usa tu correo personal."
        error="Ingresa un correo válido."
        defaultValue="ana@"
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Correo' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Usa tu correo personal. Ingresa un correo válido.');
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresa un correo válido.');
  });

  it('RF-000-16: respeta un id propio y alto mínimo de 48 px con texto de 17 px', () => {
    render(<Field label="Nombre" id="nombre" />);
    const input = screen.getByLabelText('Nombre');
    expect(input).toHaveAttribute('id', 'nombre');
    expect(input).toHaveClass('min-h-12', 'text-body');
  });
});
