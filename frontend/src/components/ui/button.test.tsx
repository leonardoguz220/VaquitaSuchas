import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';

describe('Button (RF-000-16)', () => {
  it('RF-000-16: es un botón con nombre accesible y type="button" por defecto', () => {
    render(<Button>Guardar</Button>);
    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toBeEnabled();
  });

  it('RF-000-16: respeta type="submit" cuando se indica', () => {
    render(<Button type="submit">Ingresar</Button>);
    expect(screen.getByRole('button', { name: 'Ingresar' })).toHaveAttribute('type', 'submit');
  });

  it('RF-000-16: tiene alto mínimo de 48 px (área táctil de al menos 44 px)', () => {
    render(<Button variant="secondary">Copiar</Button>);
    expect(screen.getByRole('button', { name: 'Copiar' })).toHaveClass('min-h-12');
  });

  it.each([
    ['primary', 'bg-primary'],
    ['secondary', 'border-primary'],
    ['danger', 'border-danger'],
  ] as const)('RF-000-16: la variante %s aplica su estilo', (variant, expectedClass) => {
    render(<Button variant={variant}>Acción</Button>);
    expect(screen.getByRole('button', { name: 'Acción' })).toHaveClass(expectedClass);
  });

  it('RF-000-16: loading deshabilita el botón, marca aria-busy y anuncia "Cargando…"', async () => {
    const onClick = jest.fn();
    render(
      <Button loading onClick={onClick}>
        Guardar
      </Button>,
    );
    const button = screen.getByRole('button', { name: /Cargando…/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Guardar');

    await userEvent.setup().click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('RF-000-16: sin loading responde al clic y no marca aria-busy', async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Confirmar</Button>);
    const button = screen.getByRole('button', { name: 'Confirmar' });
    expect(button).not.toHaveAttribute('aria-busy');
    await userEvent.setup().click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('RF-000-16: con href se muestra como enlace con estilo de botón', () => {
    render(<Button href="/registro">Crear cuenta</Button>);
    const link = screen.getByRole('link', { name: 'Crear cuenta' });
    expect(link).toHaveAttribute('href', '/registro');
    expect(link).toHaveClass('min-h-12');
  });
});
