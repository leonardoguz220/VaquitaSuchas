import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell, GLOBAL_NOTICES_ID, MAIN_CONTENT_ID } from './app-shell';

describe('AppShell (RF-000-16)', () => {
  it('RF-000-16: renderiza los hijos dentro del contenido principal', () => {
    render(
      <AppShell>
        <p>Contenido de prueba</p>
      </AppShell>,
    );
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', MAIN_CONTENT_ID);
    expect(main).toContainElement(screen.getByText('Contenido de prueba'));
  });

  it('RF-000-16: ofrece el enlace "Saltar al contenido" como primer elemento enfocable', async () => {
    const user = userEvent.setup();
    render(
      <AppShell>
        <button type="button">Acción</button>
      </AppShell>,
    );
    const link = screen.getByRole('link', { name: 'Saltar al contenido' });
    expect(link).toHaveAttribute('href', `#${MAIN_CONTENT_ID}`);
    await user.tab();
    expect(link).toHaveFocus();
  });

  it('RF-000-16: tiene una región de avisos globales vacía con aria-live polite', () => {
    render(<AppShell>hijo</AppShell>);
    const notices = screen.getByRole('status');
    expect(notices).toHaveAttribute('id', GLOBAL_NOTICES_ID);
    expect(notices).toHaveAttribute('aria-live', 'polite');
    expect(notices).toBeEmptyDOMElement();
  });
});
