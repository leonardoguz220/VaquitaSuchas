import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getCharge, uploadReceipt, type Charge } from '@/services/charges';
import { ApiError } from '@/services/http';
import { paidCharge, pendingCharge } from './__fixtures__/charges';
import { ChargePageView } from './charge-page';

jest.mock('@/services/charges', () => ({ getCharge: jest.fn(), uploadReceipt: jest.fn() }));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/cobros/c-pend',
}));

const mockedGet = jest.mocked(getCharge);
const mockedUpload = jest.mocked(uploadReceipt);

/** Respuesta fija del servidor: en revisión, con comprobante vigente y evento nuevo. */
const inReviewCharge: Charge = {
  ...pendingCharge,
  status: 'en_revision',
  version: 4,
  lastRejection: null,
  currentReceipt: {
    id: 'r-new',
    uploadedAt: '2026-10-19T15:00:00.000Z',
    uploadedBy: { userId: 'u-ana', fullName: 'Ana Quispe Mamani' },
    method: 'transferencia',
    reference: 'TRX-123',
    mime: 'image/jpeg',
    sizeBytes: 2 * 1024 * 1024,
    status: 'vigente',
    fileAvailable: true,
  },
  timeline: [
    ...pendingCharge.timeline,
    {
      id: 'e-new',
      type: 'comprobante_subido',
      actor: { userId: 'u-ana', fullName: 'Ana Quispe Mamani' },
      fromStatus: 'pendiente',
      toStatus: 'en_revision',
      reason: null,
      occurredAt: '2026-10-19T15:00:00.000Z',
    },
  ],
};

function makeFile(name: string, type: string, sizeBytes: number) {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

const jpg2mb = () => makeFile('comprobante.jpg', 'image/jpeg', 2 * 1024 * 1024);

async function renderPage(charge: Charge = pendingCharge) {
  mockedGet.mockResolvedValue(charge);
  const user = userEvent.setup({ applyAccept: false });
  render(<ChargePageView chargeId={charge.id} />);
  await screen.findByRole('heading', { level: 1, name: 'Cobro de Octubre 2026' });
  return user;
}

const form = () => screen.getByRole('form', { name: /comprobante/ });
const fileInput = (name = 'Subir comprobante') => screen.getByLabelText(name);
const referenceInput = () => screen.getByRole('textbox', { name: /Referencia/ });

async function fill(user: ReturnType<typeof userEvent.setup>, file: File, reference: string) {
  await user.upload(fileInput(), file);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Método' }), 'transferencia');
  if (reference) await user.type(referenceInput(), reference);
}

beforeEach(() => {
  mockedGet.mockReset();
  mockedUpload.mockReset();
  replace.mockReset();
});

describe('Subida del comprobante en /cobros/[id] (T022, RF-002-06, RF-002-07)', () => {
  it('CA-002-04: un JPG de 2 MB en 3 toques deja el cobro en revisión y aparece en la línea de tiempo', async () => {
    mockedUpload.mockResolvedValue(inReviewCharge);
    const user = await renderPage();

    const input = fileInput();
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,application/pdf');
    // Toque 1: elegir el archivo (cámara o galería).
    await user.upload(input, jpg2mb());
    expect(within(form()).getByText('comprobante.jpg')).toBeVisible();
    expect(within(form()).getByText(/2,0 MB/)).toBeVisible();
    // Toque 2: método y referencia.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Método' }), 'transferencia');
    await user.type(referenceInput(), ' TRX-123 ');
    // Toque 3: Enviar.
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Comprobante enviado; el titular lo revisará')).toBeVisible();
    expect(mockedUpload).toHaveBeenCalledWith(pendingCharge.id, {
      file: expect.any(File),
      method: 'transferencia',
      reference: 'TRX-123',
      version: pendingCharge.version,
    });
    expect(screen.getByText('En revisión')).toBeVisible();
    const timeline = screen.getByRole('region', { name: /Historial|Línea de tiempo/ });
    expect(within(timeline).getAllByText('Comprobante enviado')).toHaveLength(2);
    expect(screen.getByLabelText('Reemplazar comprobante')).toBeInTheDocument();
  });

  it('CA-002-05: un archivo de 6 MB o un .exe se rechaza en el cliente y el estado no cambia', async () => {
    const user = await renderPage();
    await user.upload(fileInput(), makeFile('grande.jpg', 'image/jpeg', 6 * 1024 * 1024));
    expect(screen.getByText('El archivo supera 5 MB. Elige uno más liviano.')).toBeVisible();
    expect(fileInput()).toHaveAttribute('aria-invalid', 'true');

    await user.upload(fileInput(), makeFile('virus.exe', 'application/x-msdownload', 1000));
    expect(screen.getByText('Solo se aceptan archivos JPG, PNG o PDF.')).toBeVisible();

    await user.type(referenceInput(), 'TRX-1');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(screen.getByText('Elige la foto o el PDF de tu comprobante.')).toBeVisible();
    expect(mockedUpload).not.toHaveBeenCalled();
    expect(screen.getByText('Pendiente')).toBeVisible();
  });

  it('CA-002-05: si el servidor responde 413 o 415 el error queda en el archivo', async () => {
    mockedUpload.mockRejectedValueOnce(new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'x'));
    const user = await renderPage();
    await fill(user, jpg2mb(), 'TRX-1');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Solo se aceptan archivos JPG, PNG o PDF.')).toBeVisible();

    mockedUpload.mockRejectedValueOnce(new ApiError(413, 'FILE_TOO_LARGE', 'x'));
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('El archivo supera 5 MB. Elige uno más liviano.')).toBeVisible();
    expect(screen.getByText('Pendiente')).toBeVisible();
  });

  it('CA-002-26: sin referencia no se envía y el campo lo explica', async () => {
    const user = await renderPage();
    await user.upload(fileInput(), jpg2mb());
    await user.type(referenceInput(), '   ');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(mockedUpload).not.toHaveBeenCalled();
    expect(referenceInput()).toHaveAttribute('aria-invalid', 'true');
    expect(referenceInput()).toHaveAccessibleDescription(
      expect.stringContaining('Escribe la referencia que aparece en tu comprobante.'),
    );
    expect(referenceInput()).toHaveFocus();
    expect(referenceInput()).toHaveAttribute('maxLength', '100');
  });

  it('CA-002-27: una referencia ya usada en el grupo muestra el mensaje en el campo', async () => {
    mockedUpload.mockRejectedValue(new ApiError(409, 'REFERENCE_ALREADY_USED', 'x'));
    const user = await renderPage();
    await fill(user, jpg2mb(), 'TRX-USADA');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() =>
      expect(referenceInput()).toHaveAccessibleDescription(
        expect.stringContaining('Esa referencia ya fue usada en este grupo'),
      ),
    );
    expect(screen.getByText('Pendiente')).toBeVisible();
  });

  it('CA-002-11: un cobro pagado no muestra el botón para subir', async () => {
    await renderPage(paidCharge);
    expect(screen.queryByLabelText('Subir comprobante')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument();
  });

  it('CA-002-11: un 409 INVALID_TRANSITION muestra «Este cobro ya no admite cambios.»', async () => {
    mockedUpload.mockRejectedValue(
      new ApiError(409, 'INVALID_TRANSITION', 'x', { from: 'pagado' }),
    );
    const user = await renderPage();
    await fill(user, jpg2mb(), 'TRX-1');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este cobro ya no admite cambios.');
  });

  it('RF-002-08: en revisión, si la API lo permite, el botón dice «Reemplazar comprobante»', async () => {
    await renderPage({ ...inReviewCharge, allowedActions: ['uploadReceipt'] });
    expect(screen.getByLabelText('Reemplazar comprobante')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reemplaza tu comprobante' })).toBeVisible();
  });

  it('RF-002-06: un PDF se muestra con su nombre, sin vista previa de imagen', async () => {
    const user = await renderPage();
    await user.upload(fileInput(), makeFile('pago.pdf', 'application/pdf', 300 * 1024));
    expect(within(form()).getByText('pago.pdf')).toBeVisible();
    expect(screen.queryByAltText('Vista previa del comprobante')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Cambiar archivo')).toBeInTheDocument();
  });

  it('RNF-002-06: 409 STALE_STATE recarga el cobro y lo avisa', async () => {
    mockedUpload.mockRejectedValue(new ApiError(409, 'STALE_STATE', 'x'));
    const user = await renderPage();
    mockedGet.mockResolvedValue({ ...pendingCharge, version: 5 });
    await fill(user, jpg2mb(), 'TRX-1');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(
      await screen.findByText('Otra persona modificó el cobro; recargamos los datos'),
    ).toBeVisible();
    expect(mockedGet).toHaveBeenLastCalledWith(pendingCharge.id);
  });

  it('RNF-002-06: 503 avisa que no se guardó el archivo y el cobro no cambió', async () => {
    mockedUpload.mockRejectedValue(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    const user = await renderPage();
    await fill(user, jpg2mb(), 'TRX-1');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos guardar el archivo, intenta de nuevo');
    expect(alert).toHaveTextContent('El cobro no cambió.');
    expect(screen.getByText('Pendiente')).toBeVisible();
  });

  it.each([
    [new ApiError(0, 'NETWORK_ERROR', 'x'), 'Sin conexión con el servidor.'],
    [new ApiError(422, 'GROUP_FROZEN', 'x'), 'El grupo está congelado'],
    [new ApiError(400, 'VALIDATION_ERROR', 'x'), 'Revisa el método y la referencia'],
  ])('RNF-002-06: el error %p muestra un mensaje claro', async (error, text) => {
    mockedUpload.mockRejectedValue(error);
    const user = await renderPage();
    await fill(user, jpg2mb(), 'TRX-1');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it('RNF-002-06: mientras envía, el botón queda en carga', async () => {
    mockedUpload.mockReturnValue(new Promise(() => {}));
    const user = await renderPage();
    await fill(user, jpg2mb(), 'TRX-1');
    await user.click(screen.getByRole('button', { name: /Enviar/ }));
    expect(screen.getByRole('button', { name: /Enviar/ })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Cargando…')).toBeInTheDocument();
  });
});
