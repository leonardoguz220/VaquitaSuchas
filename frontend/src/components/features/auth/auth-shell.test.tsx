import { render, screen } from '@testing-library/react';
import { AuthShell } from './auth-shell';
import { DataPolicySummary } from './data-policy-summary';

describe('AuthShell (plan 003 §6)', () => {
  it('RNF-003-04: muestra paso, título único, subtítulo, contenido y pie', () => {
    render(
      <AuthShell title="Crea tu cuenta" subtitle="Subtítulo" step="Paso 1 de 2" footer={<p>Pie</p>}>
        <p>Formulario</p>
      </AuthShell>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Crea tu cuenta' })).toBeInTheDocument();
    expect(screen.getByText('Paso 1 de 2')).toBeInTheDocument();
    expect(screen.getByText('Subtítulo')).toBeInTheDocument();
    expect(screen.getByText('Formulario')).toBeInTheDocument();
    expect(screen.getByText('Pie')).toBeInTheDocument();
  });

  it('RNF-003-04: el logo tiene el ícono oculto y el nombre como texto', () => {
    render(
      <AuthShell title="Ingresa">
        <p>x</p>
      </AuthShell>,
    );
    expect(screen.getAllByText('vaquita').length).toBeGreaterThan(0);
    for (const svg of document.querySelectorAll('svg')) {
      expect(svg.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('RNF-003-04: el panel de marca solo aparece desde lg (celular primero)', () => {
    render(
      <AuthShell title="Ingresa">
        <p>x</p>
      </AuthShell>,
    );
    const brand = screen.getByRole('region', { name: 'Vaquita' });
    expect(brand).toHaveClass('hidden', 'lg:flex');
  });
});

describe('DataPolicySummary (RF-003-23)', () => {
  it('RF-003-23: explica qué datos se piden, para qué y cuánto se conservan', () => {
    render(<DataPolicySummary />);
    expect(screen.getByRole('heading', { name: 'Qué datos pedimos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Para qué los usamos' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Cuánto tiempo los conservamos' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/nombre completo, tu correo y tu cédula/)).toBeInTheDocument();
    expect(screen.getByText(/celular y la cuenta de Telegram/)).toBeInTheDocument();
    expect(screen.getByText(/identificar a las personas/)).toBeInTheDocument();
    expect(screen.getByText(/bloquear a quien\s+estafe/)).toBeInTheDocument();
    expect(screen.getByText(/se conservan 2 meses/)).toBeInTheDocument();
    expect(screen.getByText(/de forma permanente una huella irreversible/)).toBeInTheDocument();
  });
});
