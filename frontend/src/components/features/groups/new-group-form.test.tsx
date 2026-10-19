import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createGroup, quoteGroup, updatePaymentInfo } from '@/services/groups';
import { ApiError } from '@/services/http';
import { createdGroup, customChoice, estandarChoice, quote } from './__fixtures__/groups';
import { NewGroupForm, type NewGroupFormProps } from './new-group-form';

jest.mock('@/services/groups', () => ({
  quoteGroup: jest.fn(),
  createGroup: jest.fn(),
  updatePaymentInfo: jest.fn(),
}));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/grupos/nuevo',
}));

const mockedQuote = jest.mocked(quoteGroup);
const mockedCreate = jest.mocked(createGroup);
const mockedUpload = jest.mocked(updatePaymentInfo);

function renderForm(props: Partial<NewGroupFormProps> = {}) {
  const handlers = {
    onBack: jest.fn(),
    onCreated: jest.fn(),
    onEligibilityProblem: jest.fn(),
  };
  render(<NewGroupForm choice={estandarChoice} blocked={false} {...handlers} {...props} />);
  return handlers;
}

function file(name: string, type: string, size = 1024): File {
  const result = new File(['x'], name, { type });
  Object.defineProperty(result, 'size', { value: size });
  return result;
}

const submit = () => screen.getByRole('button', { name: 'Crear suscripción' });

beforeEach(() => {
  jest.clearAllMocks();
  mockedQuote.mockResolvedValue(quote);
  mockedCreate.mockResolvedValue(createdGroup);
  mockedUpload.mockResolvedValue({
    paymentInfo: { text: null, qrUrl: 'https://storage.example.com/qr.png', configured: true },
  });
  URL.createObjectURL = jest.fn(() => 'blob:qr-preview');
  URL.revokeObjectURL = jest.fn();
});

describe('Paso 3 de /grupos/nuevo (T016, plan 001 §6)', () => {
  it('RF-001-05: propone precio, moneda y cupos del plan, y el precio se puede editar', async () => {
    const user = userEvent.setup();
    renderForm();
    const price = screen.getByLabelText('Precio mensual');
    expect(price).toHaveValue('14,66');
    expect(screen.getByLabelText('Moneda')).toHaveValue('USD');
    expect(screen.getByLabelText('Cupos (contándote)')).toHaveValue(3);
    expect(screen.getByText('Este plan permite hasta 3.')).toBeVisible();
    expect(screen.getByText('Propuesto por el catálogo; puedes cambiarlo.')).toBeVisible();

    await user.clear(price);
    await user.type(price, '20,00');
    expect(price).toHaveValue('20,00');
  });

  it('CA-001-01 y CA-001-25: con datos válidos envía POST /groups con el plan y avisa con el grupo creado', async () => {
    const user = userEvent.setup();
    const { onCreated } = renderForm();
    await user.type(screen.getByLabelText('Nombre del grupo'), 'Netflix del depa');
    await user.type(screen.getByLabelText('Tipo de cambio (Bs por USD)'), '6,96');
    await user.selectOptions(screen.getByLabelText('Día de cobro'), '15');
    await user.click(submit());

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(mockedCreate).toHaveBeenCalledWith({
      catalogPlanSlug: 'netflix-estandar',
      customServiceName: null,
      name: 'Netflix del depa',
      priceCents: 1466,
      currency: 'USD',
      exchangeRate: '6.9600',
      billingDay: 15,
      totalSlots: 3,
      paymentInfoText: null,
    });
    expect(onCreated).toHaveBeenCalledWith({ group: createdGroup, qrError: null });
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('CA-001-02: con USD y sin tipo de cambio no se envía nada y se marca el campo', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Nombre del grupo'), 'Netflix del depa');
    await user.click(submit());

    const rate = screen.getByLabelText('Tipo de cambio (Bs por USD)');
    expect(rate).toHaveAttribute('aria-invalid', 'true');
    expect(rate).toHaveFocus();
    expect(rate).toHaveAccessibleDescription(/el tipo de cambio es obligatorio/);
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(screen.getByText(/Completa el precio, el tipo de cambio y los cupos/)).toBeVisible();
  });

  it('CA-001-02: si el backend responde 400 por exchangeRate, el error va al campo', async () => {
    const user = userEvent.setup();
    mockedCreate.mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'x', { fields: { exchangeRate: ['REQUIRED'] } }),
    );
    const { onCreated } = renderForm();
    await user.type(screen.getByLabelText('Nombre del grupo'), 'Netflix del depa');
    await user.type(screen.getByLabelText('Tipo de cambio (Bs por USD)'), '6,96');
    await user.click(submit());

    await waitFor(() =>
      expect(screen.getByLabelText('Tipo de cambio (Bs por USD)')).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    );
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('CA-001-03: con Bs no pide tipo de cambio ni lo envía, ni en la cotización ni al crear', async () => {
    const user = userEvent.setup();
    renderForm({ choice: customChoice });
    expect(screen.getByLabelText('Moneda')).toHaveValue('BS');
    expect(screen.queryByLabelText('Tipo de cambio (Bs por USD)')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Nombre del servicio'), 'Canva Pro');
    await user.type(screen.getByLabelText('Nombre del grupo'), 'Diseño del depa');
    await user.type(screen.getByLabelText('Precio mensual'), '60');
    await waitFor(() =>
      expect(mockedQuote).toHaveBeenCalledWith(
        { priceCents: 6000, currency: 'BS', memberCount: 2 },
        expect.anything(),
      ),
    );
    await user.click(submit());

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    const body = mockedCreate.mock.calls[0][0];
    expect(body).not.toHaveProperty('exchangeRate');
    expect(body).toMatchObject({
      catalogPlanSlug: null,
      customServiceName: 'Canva Pro',
      currency: 'BS',
      priceCents: 6000,
      totalSlots: 2,
    });
  });

  it('CA-001-03: al cambiar a Bs desaparece el tipo de cambio', async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.getByLabelText('Tipo de cambio (Bs por USD)')).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Moneda'), 'BS');
    expect(screen.queryByLabelText('Tipo de cambio (Bs por USD)')).not.toBeInTheDocument();
  });

  it('RF-001-02: los cupos no pueden pasar del máximo del plan (RN-001-13) ni bajar de 2', async () => {
    const user = userEvent.setup();
    renderForm();
    const slots = screen.getByLabelText('Cupos (contándote)');
    await user.clear(slots);
    await user.type(slots, '4');
    await user.click(submit());
    expect(slots).toHaveAccessibleDescription(/Los cupos van de 2 a 3/);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('CA-001-01: «Total en Bs» y la cuota con el grupo lleno salen de POST /groups/quote tal cual, sin calcular', async () => {
    mockedQuote.mockResolvedValue({
      totalBsCents: 99999,
      baseShareCents: 1234,
      ownerShareCents: 1,
      remainderCents: 7,
    });
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Tipo de cambio (Bs por USD)'), '6,96');

    const panel = screen.getByRole('region', { name: 'Así queda la cuota' });
    expect(await within(panel).findByText('Bs 12,34')).toBeVisible();
    expect(within(panel).getByText('Bs 999,99')).toBeVisible();
    expect(within(panel).getByText('USD 14,66')).toBeVisible();
    expect(within(panel).getByText('6,96')).toBeVisible();
    expect(within(panel).getByText(/Tú asumes los Bs 0,07/)).toBeVisible();
    expect(
      within(panel).getByText('Con el grupo lleno (3 personas), cada uno pagaría'),
    ).toBeVisible();
    expect(
      within(panel).getByText('La cuota real se calcula con los miembros que haya en cada cobro.'),
    ).toBeVisible();
    expect(mockedQuote).toHaveBeenLastCalledWith(
      { priceCents: 1466, currency: 'USD', exchangeRate: '6.9600', memberCount: 3 },
      expect.anything(),
    );
  });

  it('CA-001-01: la cotización espera 300 ms tras el último cambio y pide solo la última', async () => {
    jest.useFakeTimers();
    try {
      renderForm({ choice: customChoice });
      const price = screen.getByLabelText('Precio mensual');
      fireEvent.change(price, { target: { value: '6' } });
      fireEvent.change(price, { target: { value: '60' } });
      act(() => jest.advanceTimersByTime(299));
      expect(mockedQuote).not.toHaveBeenCalled();
      expect(screen.getByText('Calculando la cuota…')).toBeVisible();
      await act(async () => jest.advanceTimersByTime(1));
      expect(mockedQuote).toHaveBeenCalledTimes(1);
      expect(mockedQuote).toHaveBeenCalledWith(
        { priceCents: 6000, currency: 'BS', memberCount: 2 },
        expect.anything(),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('CA-001-01: si la cotización falla por conexión muestra «Reintentar» y vuelve a pedirla', async () => {
    mockedQuote.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'));
    const user = userEvent.setup();
    renderForm({ choice: customChoice });
    await user.type(screen.getByLabelText('Precio mensual'), '60');
    const panel = screen.getByRole('region', { name: 'Así queda la cuota' });
    expect(await within(panel).findByText('No se pudo contactar con el servidor.')).toBeVisible();

    await user.click(within(panel).getByRole('button', { name: 'Reintentar' }));
    expect(await within(panel).findByText('Bs 25,50')).toBeVisible();
    expect(mockedQuote).toHaveBeenCalledTimes(2);
  });

  it('RF-001-20: los datos de pago aceptan hasta 500 caracteres y se envían', async () => {
    const user = userEvent.setup();
    renderForm({ choice: customChoice });
    const text = screen.getByLabelText('Datos de pago para los miembros (opcional)');
    expect(text).toHaveAttribute('maxLength', '500');
    await user.type(text, 'Banco Unión 1000-2345678');
    expect(screen.getByText(/24\/500 caracteres/)).toBeVisible();

    await user.type(screen.getByLabelText('Nombre del servicio'), 'Canva Pro');
    await user.type(screen.getByLabelText('Nombre del grupo'), 'Diseño');
    await user.type(screen.getByLabelText('Precio mensual'), '60');
    await user.click(submit());
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith(
        expect.objectContaining({ paymentInfoText: 'Banco Unión 1000-2345678' }),
      ),
    );
  });

  it('RF-001-20: el QR JPG o PNG muestra vista previa y se sube tras crear el grupo', async () => {
    const user = userEvent.setup();
    const { onCreated } = renderForm();
    const qr = file('qr.png', 'image/png');
    await user.upload(screen.getByLabelText('Subir QR'), qr);
    expect(screen.getByRole('img', { name: 'Vista previa del QR de pago' })).toHaveAttribute(
      'src',
      'blob:qr-preview',
    );
    expect(screen.getByText('qr.png')).toBeVisible();

    await user.type(screen.getByLabelText('Nombre del grupo'), 'Netflix del depa');
    await user.type(screen.getByLabelText('Tipo de cambio (Bs por USD)'), '6,96');
    await user.click(submit());

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(mockedUpload).toHaveBeenCalledWith(createdGroup.id, { qr });
    expect(onCreated.mock.calls[0][0].qrError).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Quitar QR' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it.each([
    ['un PDF', file('qr.pdf', 'application/pdf'), 'El QR debe ser una imagen JPG o PNG.'],
    [
      'una imagen de más de 2 MB',
      file('qr.jpg', 'image/jpeg', 2 * 1024 * 1024 + 1),
      'El QR pesa más de 2 MB. Elige una imagen más liviana.',
    ],
  ])('RF-001-20: rechaza en el cliente %s como ayuda', async (_case, rejected, message) => {
    const user = userEvent.setup({ applyAccept: false });
    renderForm();
    await user.upload(screen.getByLabelText('Subir QR'), rejected);
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('RF-001-20: si el QR falla al subir (413), el grupo igual queda creado con el aviso', async () => {
    mockedUpload.mockRejectedValue(new ApiError(413, 'FILE_TOO_LARGE', 'x'));
    const user = userEvent.setup();
    const { onCreated } = renderForm();
    await user.upload(screen.getByLabelText('Subir QR'), file('qr.png', 'image/png'));
    await user.type(screen.getByLabelText('Nombre del grupo'), 'Netflix del depa');
    await user.type(screen.getByLabelText('Tipo de cambio (Bs por USD)'), '6,96');
    await user.click(submit());

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onCreated.mock.calls[0][0].qrError).toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('CA-001-24: un 422 NOT_HOST_ELIGIBLE avisa al asistente para mostrar qué falta', async () => {
    mockedCreate.mockRejectedValue(
      new ApiError(422, 'NOT_HOST_ELIGIBLE', 'x', { rule: 'RF-001-21' }),
    );
    const user = userEvent.setup();
    const { onEligibilityProblem } = renderForm();
    await user.type(screen.getByLabelText('Nombre del grupo'), 'Netflix del depa');
    await user.type(screen.getByLabelText('Tipo de cambio (Bs por USD)'), '6,96');
    await user.click(submit());

    expect(await screen.findByText('Todavía no puedes crear suscripciones.')).toBeVisible();
    expect(onEligibilityProblem).toHaveBeenCalledTimes(1);
  });

  it('CA-001-28: un 422 TOO_MANY_ACTIVE_GROUPS también abre el panel', async () => {
    mockedCreate.mockRejectedValue(
      new ApiError(422, 'TOO_MANY_ACTIVE_GROUPS', 'x', { rule: 'RN-001-14' }),
    );
    const user = userEvent.setup();
    const { onEligibilityProblem } = renderForm({ choice: customChoice });
    await user.type(screen.getByLabelText('Nombre del servicio'), 'Canva Pro');
    await user.type(screen.getByLabelText('Nombre del grupo'), 'Diseño');
    await user.type(screen.getByLabelText('Precio mensual'), '60');
    await user.click(submit());

    expect(
      await screen.findByText('Ya llegaste al límite de grupos activos como titular.'),
    ).toBeVisible();
    expect(onEligibilityProblem).toHaveBeenCalledTimes(1);
  });

  it('CA-001-24: bloqueado no deja enviar', () => {
    renderForm({ blocked: true });
    expect(submit()).toBeDisabled();
  });

  it('CA-001-01: sin conexión al crear muestra «Reintentar» y reenvía el mismo cuerpo', async () => {
    mockedCreate.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    const user = userEvent.setup();
    const { onCreated } = renderForm();
    await user.type(screen.getByLabelText('Nombre del grupo'), 'Netflix del depa');
    await user.type(screen.getByLabelText('Tipo de cambio (Bs por USD)'), '6,96');
    await user.click(submit());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo contactar con el servidor.');
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(mockedCreate).toHaveBeenCalledTimes(2);
    expect(mockedCreate.mock.calls[1][0]).toEqual(mockedCreate.mock.calls[0][0]);
  });

  it('RF-001-01: «Volver» regresa al paso anterior', async () => {
    const user = userEvent.setup();
    const { onBack } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(onBack).toHaveBeenCalled();
  });
});
