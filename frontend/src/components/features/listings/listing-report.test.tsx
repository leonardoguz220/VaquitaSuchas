import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/services/http';
import { reportListing } from '@/services/listings';
import { ListingReportPanel } from './listing-report';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/cupos/l1',
}));
jest.mock('@/services/listings', () => ({
  ...jest.requireActual('@/services/listings'),
  reportListing: jest.fn(),
}));

const mockedReport = jest.mocked(reportListing);

beforeEach(() => mockedReport.mockReset());

/** Abre el modal con el botón Reportar. */
async function openModal(actor: ReturnType<typeof userEvent.setup>) {
  await actor.click(screen.getByRole('button', { name: 'Reportar' }));
  return screen.getByRole('dialog', { name: 'Reportar esta publicación' });
}

describe('Reportar una publicación desde /cupos/[id] (spec 008 T023)', () => {
  it('RF-008-17: el modal abre con los motivos del contrato y el comentario tiene contador X/300', async () => {
    const actor = userEvent.setup();
    render(<ListingReportPanel listingId="l1" />);
    await openModal(actor);
    const reason = screen.getByRole('combobox', { name: 'Motivo' });
    expect(reason).toHaveFocus();
    for (const label of ['Spam o publicidad', 'Datos falsos', 'Conducta indebida', 'Otro motivo']) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText('0/300')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
  });

  it('RF-008-17: sin motivo no envía y muestra el aviso de elegir uno', async () => {
    const actor = userEvent.setup();
    render(<ListingReportPanel listingId="l1" />);
    await openModal(actor);
    await actor.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    expect(mockedReport).not.toHaveBeenCalled();
    expect(screen.getByText('Elige un motivo para enviar el reporte.')).toBeVisible();
  });

  it('RF-008-17: envía el motivo y el comentario sin espacios sobrantes; al tener éxito avisa y cierra el modal', async () => {
    const actor = userEvent.setup();
    mockedReport.mockResolvedValue(undefined);
    render(<ListingReportPanel listingId="l1" />);
    await openModal(actor);
    await actor.selectOptions(screen.getByRole('combobox', { name: 'Motivo' }), 'datos_falsos');
    await actor.type(
      screen.getByRole('textbox', { name: 'Comentario (opcional)' }),
      '  Las fotos no son del titular.  ',
    );
    await actor.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    expect(mockedReport).toHaveBeenCalledWith('l1', {
      reason: 'datos_falsos',
      comment: 'Las fotos no son del titular.',
    });
    expect(await screen.findByText('Reporte enviado')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reportar' })).not.toBeInTheDocument();
  });

  it('RF-008-17: sin comentario envía solo el motivo', async () => {
    const actor = userEvent.setup();
    mockedReport.mockResolvedValue(undefined);
    render(<ListingReportPanel listingId="l1" />);
    await openModal(actor);
    await actor.selectOptions(screen.getByRole('combobox', { name: 'Motivo' }), 'spam');
    await actor.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    expect(mockedReport).toHaveBeenCalledWith('l1', { reason: 'spam' });
  });

  it('CA-008-18: si el usuario ya reportó la publicación, el servidor rechaza y el modal muestra el aviso', async () => {
    const actor = userEvent.setup();
    mockedReport.mockRejectedValue(new ApiError(409, 'ALREADY_REPORTED', 'x'));
    render(<ListingReportPanel listingId="l1" />);
    await openModal(actor);
    await actor.selectOptions(screen.getByRole('combobox', { name: 'Motivo' }), 'spam');
    await actor.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    expect(await screen.findByText('Ya reportaste esta publicación.')).toBeVisible();
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enviar reporte' })).toBeEnabled();
  });

  it('RF-008-17: mientras envía, Enviar queda desactivado y Cancelar también', async () => {
    const actor = userEvent.setup();
    mockedReport.mockReturnValue(new Promise(() => {}));
    render(<ListingReportPanel listingId="l1" />);
    await openModal(actor);
    await actor.selectOptions(screen.getByRole('combobox', { name: 'Motivo' }), 'otro');
    await actor.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    expect(screen.getByRole('button', { name: /Enviando el reporte/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  });

  it('RF-008-17: Cancelar y Esc cierran el modal sin enviar', async () => {
    const actor = userEvent.setup();
    render(<ListingReportPanel listingId="l1" />);
    await openModal(actor);
    await actor.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await openModal(actor);
    await actor.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedReport).not.toHaveBeenCalled();
  });
});
