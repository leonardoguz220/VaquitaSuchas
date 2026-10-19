import { customChoice, estandarChoice } from './__fixtures__/groups';
import {
  FORM_MESSAGES,
  initialValues,
  toQuoteRequest,
  validateGroupForm,
  validateQrFile,
  type GroupFormValues,
} from './new-group-form-model';

function values(overrides: Partial<GroupFormValues> = {}): GroupFormValues {
  return { ...initialValues(estandarChoice), name: 'Netflix del depa', ...overrides };
}

function qrFile(type: string, size: number): File {
  const file = new File(['x'], 'qr', { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('Modelo del paso 3 de /grupos/nuevo', () => {
  it('RF-001-05: propone precio, moneda y cupos del plan; personalizado arranca en Bs y 2 cupos', () => {
    expect(initialValues(estandarChoice)).toMatchObject({
      price: '14,66',
      currency: 'USD',
      totalSlots: '3',
      billingDay: '1',
    });
    expect(initialValues(customChoice)).toMatchObject({
      price: '',
      currency: 'BS',
      totalSlots: '2',
    });
  });

  it('CA-001-02: con USD sin tipo de cambio no cotiza ni deja crear', () => {
    expect(toQuoteRequest(values(), estandarChoice)).toBeNull();
    expect(validateGroupForm(values(), estandarChoice)).toEqual({
      ok: false,
      errors: { exchangeRate: FORM_MESSAGES.exchangeRateRequired },
    });
  });

  it('CA-001-03: con Bs no envía tipo de cambio aunque haya quedado escrito', () => {
    const form = values({ currency: 'BS', exchangeRate: '6,96', price: '60' });
    expect(toQuoteRequest(form, estandarChoice)).toEqual({
      priceCents: 6000,
      currency: 'BS',
      memberCount: 3,
    });
    const result = validateGroupForm(form, estandarChoice);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.request).not.toHaveProperty('exchangeRate');
  });

  it('CA-001-01: arma el cuerpo de POST /groups con exactamente uno de plan o servicio', () => {
    const plan = validateGroupForm(values({ exchangeRate: '6,96' }), estandarChoice);
    expect(plan).toMatchObject({
      ok: true,
      request: {
        catalogPlanSlug: 'netflix-estandar',
        customServiceName: null,
        exchangeRate: '6.9600',
      },
    });
    const custom = validateGroupForm(
      { ...initialValues(customChoice), customServiceName: ' Canva ', name: 'D', price: '60' },
      customChoice,
    );
    expect(custom).toMatchObject({
      ok: true,
      request: { catalogPlanSlug: null, customServiceName: 'Canva' },
    });
  });

  it('RF-001-02: exige nombres, precio y cupos entre 2 y el máximo', () => {
    const result = validateGroupForm(
      { ...initialValues(customChoice), price: 'abc', totalSlots: '21' },
      customChoice,
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        customServiceName: FORM_MESSAGES.customServiceNameRequired,
        name: FORM_MESSAGES.nameRequired,
        price: FORM_MESSAGES.priceInvalid,
        totalSlots: FORM_MESSAGES.slotsRange(20),
      },
    });
  });

  it('RF-001-20: el QR solo JPG o PNG de hasta 2 MB', () => {
    expect(validateQrFile(qrFile('image/png', 2 * 1024 * 1024))).toBeNull();
    expect(validateQrFile(qrFile('image/jpeg', 10))).toBeNull();
    expect(validateQrFile(qrFile('image/gif', 10))).toBe(FORM_MESSAGES.qrType);
    expect(validateQrFile(qrFile('image/png', 2 * 1024 * 1024 + 1))).toBe(FORM_MESSAGES.qrSize);
  });
});
