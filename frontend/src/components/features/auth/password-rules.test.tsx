import { render, screen, within } from '@testing-library/react';
import { PasswordRules } from './password-rules';

function ruleItem(text: string) {
  const list = screen.getByRole('list', { name: 'Reglas de la contraseña' });
  return within(list)
    .getAllByRole('listitem')
    .find((li) => li.textContent?.startsWith(text))!;
}

describe('PasswordRules (RF-003-03, RNF-003-04)', () => {
  it('RF-003-03: con la contraseña vacía todas las reglas están pendientes', () => {
    render(<PasswordRules id="rules" password="" email="" />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);
    for (const item of items) expect(item).toHaveTextContent(/pendiente$/);
  });

  it('CA-003-03: una contraseña de 8 caracteres deja pendiente "Al menos 10 caracteres"', () => {
    render(<PasswordRules id="rules" password="abcd1234" email="ana@gmail.com" />);
    expect(ruleItem('Al menos 10 caracteres')).toHaveTextContent(': pendiente');
    expect(ruleItem('Al menos una letra')).toHaveTextContent(': cumplida');
    expect(ruleItem('Al menos un número')).toHaveTextContent(': cumplida');
    expect(ruleItem('Distinta de tu correo')).toHaveTextContent(': cumplida');
  });

  it('RF-003-03: sin número y sin letra se marcan por separado', () => {
    const { rerender } = render(<PasswordRules id="r" password="abcdefghij" email="" />);
    expect(ruleItem('Al menos un número')).toHaveTextContent(': pendiente');
    rerender(<PasswordRules id="r" password="1234567890" email="" />);
    expect(ruleItem('Al menos una letra')).toHaveTextContent(': pendiente');
  });

  it('RF-003-03: igual al correo deja pendiente "Distinta de tu correo"', () => {
    render(<PasswordRules id="r" password="ana12@gmail.com" email="Ana12@gmail.com" />);
    expect(ruleItem('Distinta de tu correo')).toHaveTextContent(': pendiente');
  });

  it('RNF-003-04: el estado no depende solo del color: texto oculto e ícono distinto', () => {
    render(<PasswordRules id="r" password="vaquita2026" email="ana@gmail.com" />);
    const item = ruleItem('Al menos 10 caracteres');
    expect(item).toHaveAttribute('data-met', 'true');
    expect(item.querySelector('path')).not.toBeNull(); // marca de verificación
    expect(ruleItem('Al menos un número').querySelector('svg')).not.toBeNull();
  });

  it('RNF-003-04: un resumen con aria-live anuncia cuántas reglas se cumplen', () => {
    render(<PasswordRules id="r" password="abcd1234" email="ana@gmail.com" />);
    expect(screen.getByText('La contraseña cumple 3 de 4 reglas.')).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });

  it('RNF-003-04: sin correo (recuperación) muestra solo las tres reglas evaluables y una nota', () => {
    render(<PasswordRules id="r" password="nuevaclave2026" />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    for (const item of items) expect(item).toHaveTextContent(/cumplida$/);
    expect(screen.queryByText(/Distinta de tu correo/)).not.toBeInTheDocument();
    expect(
      screen.getByText('Tampoco puede ser igual a tu correo: lo comprobamos al guardar.'),
    ).toBeInTheDocument();
    expect(screen.getByText('La contraseña cumple 3 de 3 reglas.')).toBeInTheDocument();
  });

  it('RF-003-03: con correo no muestra la nota del servidor', () => {
    render(<PasswordRules id="r" password="" email="" />);
    expect(screen.queryByText(/lo comprobamos al guardar/)).not.toBeInTheDocument();
  });
});
