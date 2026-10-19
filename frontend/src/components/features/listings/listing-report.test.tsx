import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/services/http';
import { reportListing } from '@/services/listings';
import { ListingReport } from './listing-report';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/cupos/l1',
}));
jest.mock('@/services/listings', () => ({
  ...jest.requireActual('@/services/listings'),
  reportListing: jest.fn(),
}));

const mocked = jest.mocked(reportListing);

async function openModal() {
  const user = userEvent.setup();
  render(<ListingReport listingId="l1" />);
  await user.click(screen.getByRole('button', { name: 'Reportar esta publicación' }));
  return { user, dialog: screen.getByRole('dialog', { name: 'Reportar publicación' }) };
}

beforeEach(() => mocked.mockReset());

describe('Reportar una publicación (spec 008 T023)', () => {
  it('RF-008-17: ofrece los cuatro motivos y un comentario opcional de hasta 300', async () => {
    const { dialog } = await openModal();
    const reasons = within(dialog).getByRole('group', { name: 'Motivo' });
    expect(
      within(reasons)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('value')),
    ).toEqual(['spam', 'datos_falsos', 'conducta_indebida', 'otro']);
    expect(within(reasons).getByLabelText('Datos falsos')).toBeVisible();
    expect(within(dialog).getByLabelText('Comentario (opcional)')).toHaveAttribute(
      'maxLength',
      '300',
    );
  });

  it('RF-008-17: sin motivo no envía y lo pide', async () => {
    const { user, dialog } = await openModal();
    await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte' }));
    expect(mocked).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Elige un motivo.')).toBeVisible();
  });

  it('RF-008-17: envía el motivo y el comentario recortado, y agradece', async () => {
    mocked.mockResolvedValue(undefined);
    const { user, dialog } = await openModal();
    await user.click(within(dialog).getByLabelText('Datos falsos'));
    await user.type(within(dialog).getByLabelText('Comentario (opcional)'), '  Precio falso.  ');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte' }));
    expect(mocked).toHaveBeenCalledWith('l1', { reason: 'datos_falsos', comment: 'Precio falso.' });
    expect(
      await screen.findByText('Gracias por avisar. Revisaremos la publicación.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reportar esta publicación' })).toBeNull();
  });

  it('RF-008-17: sin comentario no manda el campo', async () => {
    mocked.mockResolvedValue(undefined);
    const { user, dialog } = await openModal();
    await user.click(within(dialog).getByLabelText('Spam o publicidad'));
    await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte' }));
    expect(mocked).toHaveBeenCalledWith('l1', { reason: 'spam' });
  });

  it('CA-008-18: si ya la reportó, lo dice y no ofrece reportar de nuevo', async () => {
    mocked.mockRejectedValue(new ApiError(409, 'ALREADY_REPORTED', 'x'));
    const { user, dialog } = await openModal();
    await user.click(within(dialog).getByLabelText('Otro motivo'));
    await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte' }));
    expect(
      await screen.findByText('Ya reportaste esta publicación. Gracias por avisar.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reportar esta publicación' })).toBeNull();
  });

  it.each([
    [
      new ApiError(422, 'CANNOT_REPORT_OWN_LISTING', 'x'),
      'No puedes reportar tu propia publicación.',
    ],
    [
      new ApiError(429, 'RATE_LIMITED', 'x'),
      'Llegaste al límite de 10 reportes por día. Vuelve a intentarlo mañana.',
    ],
    [
      new ApiError(403, 'ACCOUNT_RESTRICTED', 'x'),
      'Tu cuenta está restringida: no puedes reportar.',
    ],
  ])('RF-008-17: explica el error %#', async (error, text) => {
    mocked.mockRejectedValue(error);
    const { user, dialog } = await openModal();
    await user.click(within(dialog).getByLabelText('Spam o publicidad'));
    await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte' }));
    expect(await screen.findByText(text)).toBeVisible();
  });

  it('RF-008-17: un error de conexión queda en el modal para reintentar', async () => {
    mocked.mockRejectedValue(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    const { user, dialog } = await openModal();
    await user.click(within(dialog).getByLabelText('Spam o publicidad'));
    await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte' }));
    expect(await within(dialog).findByText('No se pudo contactar con el servidor.')).toBeVisible();
  });
});
