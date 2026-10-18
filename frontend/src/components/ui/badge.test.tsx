import { render, screen } from '@testing-library/react';
import { Badge, type ChargeStatus } from './badge';

describe('Badge (RF-000-16)', () => {
  it.each([
    ['pendiente', 'Pendiente', 'bg-status-pendiente-bg'],
    ['en_revision', 'En revisión', 'bg-status-en-revision-bg'],
    ['pagado', 'Pagado', 'bg-status-pagado-bg'],
    ['atrasado', 'Atrasado', 'bg-status-atrasado-bg'],
    ['cancelado', 'Cancelado', 'bg-status-cancelado-bg'],
  ] as const)(
    'RF-000-16: el estado de cobro %s muestra el texto "%s" además del color',
    (status: ChargeStatus, label, colorClass) => {
      render(<Badge variant={status} data-testid="badge" />);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveTextContent(label);
      expect(badge).toHaveClass(colorClass, 'rounded-full');
    },
  );

  it('RF-000-16: el ícono es decorativo y no se lee', () => {
    render(<Badge variant="pagado" data-testid="badge" />);
    const icon = screen.getByTestId('badge').querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('RF-000-16: los tonos genéricos muestran el texto recibido (solicitudes de ingreso)', () => {
    render(<Badge variant="info">Pago informado</Badge>);
    expect(screen.getByText('Pago informado')).toHaveClass('bg-status-en-revision-bg');
  });

  it('RF-000-16: un texto propio reemplaza la etiqueta del estado', () => {
    render(<Badge variant="atrasado">Atrasado 3 días</Badge>);
    expect(screen.getByText('Atrasado 3 días')).toBeInTheDocument();
  });
});
