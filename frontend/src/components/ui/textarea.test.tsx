import { render, screen } from '@testing-library/react';
import { Textarea } from './textarea';

describe('Textarea (RF-000-16)', () => {
  it('RF-000-16: la etiqueta, la ayuda y el error quedan asociados al campo', () => {
    render(<Textarea label="Datos de pago" hint="Hasta 500 caracteres." error="Es muy largo." />);
    const textarea = screen.getByRole('textbox', { name: 'Datos de pago' });
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute('rows', '3');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveAccessibleDescription('Hasta 500 caracteres. Es muy largo.');
  });

  it('RF-000-16: sin error no marca aria-invalid y respeta rows', () => {
    render(<Textarea label="Notas" rows={5} />);
    const textarea = screen.getByRole('textbox', { name: 'Notas' });
    expect(textarea).not.toHaveAttribute('aria-invalid');
    expect(textarea).toHaveAttribute('rows', '5');
  });
});
