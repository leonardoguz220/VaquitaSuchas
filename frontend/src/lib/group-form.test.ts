import {
  checkQrFile,
  GROUP_FORM_MESSAGES,
  maxSlotsFor,
  QR_MAX_BYTES,
  toQuoteRequest,
  validateGroupForm,
  type GroupFormContext,
  type GroupFormValues,
} from './group-form';

const catalog: GroupFormContext = { planSlug: 'netflix-estandar', planMaxSlots: 4 };
const custom: GroupFormContext = { planSlug: null, planMaxSlots: null };

const values: GroupFormValues = {
  customServiceName: '',
  name: ' Netflix de la familia ',
  currency: 'USD',
  price: '14,66',
  exchangeRate: '6,96',
  billingDay: '1',
  totalSlots: '4',
  paymentInfoText: '  Banco Unión · Caja de ahorro 1000-2345678  ',
};

describe('validateGroupForm (plan 001 §6)', () => {
  it('RF-001-01: con un plan del catálogo arma el cuerpo de POST /groups del contrato', () => {
    expect(validateGroupForm(values, catalog)).toEqual({
      ok: true,
      body: {
        catalogPlanSlug: 'netflix-estandar',
        customServiceName: null,
        name: 'Netflix de la familia',
        priceCents: 1466,
        currency: 'USD',
        exchangeRate: '6.9600',
        billingDay: 1,
        totalSlots: 4,
        paymentInfoText: 'Banco Unión · Caja de ahorro 1000-2345678',
      },
    });
  });

  it('RF-001-01: con un servicio personalizado manda customServiceName y no el plan', () => {
    const result = validateGroupForm(
      { ...values, customServiceName: ' Canal Andino ', totalSlots: '20' },
      custom,
    );
    expect(result).toMatchObject({
      ok: true,
      body: { catalogPlanSlug: null, customServiceName: 'Canal Andino', totalSlots: 20 },
    });
  });

  it('RF-001-03: con BS no pide ni manda el tipo de cambio', () => {
    const result = validateGroupForm(
      { ...values, currency: 'BS', exchangeRate: 'cualquier cosa', paymentInfoText: ' ' },
      catalog,
    );
    expect(result).toMatchObject({ ok: true, body: { exchangeRate: null, paymentInfoText: null } });
  });

  it('RF-001-03: con USD exige el tipo de cambio', () => {
    expect(validateGroupForm({ ...values, exchangeRate: '' }, catalog)).toEqual({
      ok: false,
      errors: { exchangeRate: GROUP_FORM_MESSAGES.exchangeRate },
    });
  });

  it('RF-001-02: marca los campos obligatorios y fuera de rango', () => {
    const result = validateGroupForm(
      {
        ...values,
        name: 'N',
        price: '0',
        billingDay: '',
        totalSlots: '5',
        paymentInfoText: 'x'.repeat(501),
      },
      custom,
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        customServiceName: GROUP_FORM_MESSAGES.customServiceName,
        name: GROUP_FORM_MESSAGES.name,
        price: GROUP_FORM_MESSAGES.price,
        billingDay: GROUP_FORM_MESSAGES.billingDay,
        paymentInfoText: GROUP_FORM_MESSAGES.paymentInfoText,
      },
    });
  });

  it('RF-001-02: los cupos van de 2 al máximo del plan (o 20 si es personalizado)', () => {
    expect(maxSlotsFor(catalog)).toBe(4);
    expect(maxSlotsFor(custom)).toBe(20);
    for (const totalSlots of ['1', '5', '2,5', 'tres']) {
      expect(validateGroupForm({ ...values, totalSlots }, catalog)).toEqual({
        ok: false,
        errors: { totalSlots: 'Elige entre 2 y 4 cupos, contándote.' },
      });
    }
    expect(validateGroupForm({ ...values, billingDay: '32' }, catalog)).toMatchObject({
      ok: false,
      errors: { billingDay: GROUP_FORM_MESSAGES.billingDay },
    });
  });
});

describe('toQuoteRequest', () => {
  it('RF-001-03: arma el cuerpo de POST /groups/quote con los cupos como memberCount', () => {
    expect(toQuoteRequest(values, catalog)).toEqual({
      priceCents: 1466,
      currency: 'USD',
      exchangeRate: '6.9600',
      memberCount: 4,
    });
    expect(toQuoteRequest({ ...values, currency: 'BS', price: '102,03' }, catalog)).toEqual({
      priceCents: 10203,
      currency: 'BS',
      memberCount: 4,
    });
  });

  it('RF-001-03: devuelve null mientras falte un dato o no sea válido', () => {
    expect(toQuoteRequest({ ...values, price: '' }, catalog)).toBeNull();
    expect(toQuoteRequest({ ...values, exchangeRate: '' }, catalog)).toBeNull();
    expect(toQuoteRequest({ ...values, totalSlots: '9' }, catalog)).toBeNull();
  });
});

describe('checkQrFile (RF-001-20)', () => {
  it('RF-001-20: acepta JPG y PNG de hasta 2 MB', () => {
    expect(checkQrFile({ type: 'image/png', size: QR_MAX_BYTES })).toBeNull();
    expect(checkQrFile({ type: 'image/jpeg', size: 1 })).toBeNull();
  });

  it('RF-001-20: avisa el tipo y el tamaño no permitidos', () => {
    expect(checkQrFile({ type: 'application/pdf', size: 1 })).toBe('type');
    expect(checkQrFile({ type: 'image/png', size: QR_MAX_BYTES + 1 })).toBe('size');
  });
});
