import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Alert } from './alert';
import { Button } from './button';

describe('Alert (RF-000-16)', () => {
  it('RF-000-16: el aviso de error usa role="alert" con título, texto y acción', async () => {
    const onRetry = jest.fn();
    render(
      <Alert
        variant="error"
        title="No se pudo contactar con el servidor"
        action={<Button onClick={onRetry}>Reintentar</Button>}
      >
        Revisa tu conexión e inténtalo de nuevo.
      </Alert>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Error:');
    expect(alert).toHaveTextContent('No se pudo contactar con el servidor');
    expect(alert).toHaveTextContent('Revisa tu conexión e inténtalo de nuevo.');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['info', 'Información:'],
    ['success', 'Listo:'],
    ['warning', 'Atención:'],
  ] as const)(
    'RF-000-16: la variante %s usa role="status" y no depende solo del color',
    (variant, prefix) => {
      render(<Alert variant={variant}>Mensaje</Alert>);
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent(`${prefix}Mensaje`);
      expect(status.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );
});
