import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Tabs } from './tabs';

function Example() {
  const [selected, setSelected] = useState('resumen');
  return (
    <Tabs
      label="Secciones del grupo"
      selectedId={selected}
      onSelect={setSelected}
      items={[
        { id: 'resumen', label: 'Resumen', content: <p>Contenido del resumen</p> },
        { id: 'miembros', label: 'Miembros', content: <p>Lista de miembros</p> },
        { id: 'ajustes', label: 'Ajustes', content: <p>Ajustes del grupo</p> },
      ]}
    />
  );
}

describe('Tabs (RNF-001-04)', () => {
  it('RNF-001-04: marca la pestaña elegida y muestra su panel', async () => {
    const actor = userEvent.setup();
    render(<Example />);
    expect(screen.getByRole('tablist', { name: 'Secciones del grupo' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Resumen' })).toHaveTextContent(
      'Contenido del resumen',
    );

    await actor.click(screen.getByRole('tab', { name: 'Miembros' }));
    expect(screen.getByRole('tab', { name: 'Miembros' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Lista de miembros');
  });

  it('RNF-001-04: se recorre con flechas, Inicio y Fin, y solo la elegida está en el orden de Tab', async () => {
    const actor = userEvent.setup();
    render(<Example />);
    await actor.tab();
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Miembros' })).toHaveAttribute('tabindex', '-1');

    await actor.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Miembros' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Lista de miembros');

    await actor.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Ajustes' })).toHaveFocus();
    await actor.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveFocus();
    await actor.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Ajustes' })).toHaveFocus();
    await actor.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true');
  });
});
