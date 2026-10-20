import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Switch } from './switch';

function Controlled({ disabled = false }: { disabled?: boolean }) {
  const [on, setOn] = useState(true);
  return (
    <Switch
      label="Correo"
      aria-label="Correo: Recordatorios de pago"
      checked={on}
      disabled={disabled}
      onChange={(event) => setOn(event.target.checked)}
    />
  );
}

describe('ui/Switch', () => {
  it('RNF-005-06: es un switch accesible con el estado en texto, no solo en color', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const control = screen.getByRole('switch', { name: 'Correo: Recordatorios de pago' });
    expect(control).toBeChecked();
    expect(screen.getByText('Activado')).toBeInTheDocument();
    await user.click(control);
    expect(control).not.toBeChecked();
    expect(screen.getByText('Desactivado')).toBeInTheDocument();
  });

  it('RNF-005-06: se maneja con teclado y el área táctil mide al menos 44 px', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.tab();
    const control = screen.getByRole('switch');
    expect(control).toHaveFocus();
    await user.keyboard(' ');
    expect(control).not.toBeChecked();
    expect(control.closest('label')).toHaveClass('min-h-11');
  });

  it('RNF-005-06: deshabilitado no cambia', async () => {
    const user = userEvent.setup();
    render(<Controlled disabled />);
    const control = screen.getByRole('switch');
    await user.click(control);
    expect(control).toBeChecked();
    expect(control).toBeDisabled();
  });
});
