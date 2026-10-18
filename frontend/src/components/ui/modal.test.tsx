import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Button } from './button';
import { Modal } from './modal';

function ModalHarness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    onClose?.();
    setOpen(false);
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>Cancelar cobro</Button>
      <Modal
        open={open}
        onClose={close}
        title="¿Cancelar este cobro?"
        description="El miembro dejará de verlo como pendiente."
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Volver
            </Button>
            <Button variant="danger" onClick={close}>
              Sí, cancelar
            </Button>
          </>
        }
      />
    </>
  );
}

async function openModal() {
  const user = userEvent.setup();
  render(<ModalHarness />);
  const trigger = screen.getByRole('button', { name: 'Cancelar cobro' });
  await user.click(trigger);
  return { user, trigger, dialog: screen.getByRole('dialog') };
}

describe('Modal (RF-000-16)', () => {
  it('RF-000-16: no se muestra cerrado', () => {
    render(<ModalHarness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('RF-000-16: es un diálogo modal con nombre y descripción accesibles', async () => {
    const { dialog } = await openModal();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('¿Cancelar este cobro?');
    expect(dialog).toHaveAccessibleDescription('El miembro dejará de verlo como pendiente.');
    expect(dialog).toHaveFocus();
  });

  it('RF-000-16: cierra con Esc y devuelve el foco al botón que lo abrió', async () => {
    const { user, trigger } = await openModal();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('RF-000-16: cierra con el botón Cerrar y devuelve el foco', async () => {
    const { user, trigger } = await openModal();
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('RF-000-16: atrapa el foco: Tab y Shift+Tab ciclan dentro del diálogo', async () => {
    const { user } = await openModal();
    const closeButton = screen.getByRole('button', { name: 'Cerrar' });
    const back = screen.getByRole('button', { name: 'Volver' });
    const confirm = screen.getByRole('button', { name: 'Sí, cancelar' });

    await user.tab();
    expect(closeButton).toHaveFocus();
    await user.tab();
    expect(back).toHaveFocus();
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
  });

  it('RF-000-16: bloquea el scroll del fondo mientras está abierto', async () => {
    const { user } = await openModal();
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(document.body.style.overflow).toBe('');
  });
});
