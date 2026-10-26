import {
  describeJobError,
  isInProcessEnabled,
  isJobDue,
  isValidIntervalSeconds,
  isValidJobName,
  MAX_ERROR_MESSAGE_LENGTH,
  parseSimulatedNow,
} from './job-rules.js';

describe('isJobDue', () => {
  const now = new Date('2026-03-10T12:00:00.000Z');

  it('RF-000-14: sin ejecución exitosa previa siempre toca', () => {
    expect(isJobDue(null, now, 3600)).toBe(true);
  });

  it('RF-000-14: con intervalo 0 toca en cada disparo', () => {
    expect(isJobDue(new Date(now), now, 0)).toBe(true);
  });

  it('RF-000-14: no toca antes de cumplirse el intervalo', () => {
    const last = new Date('2026-03-10T11:00:01.000Z'); // hace 3599 s
    expect(isJobDue(last, now, 3600)).toBe(false);
  });

  it('RF-000-14: toca justo al cumplirse el intervalo y después', () => {
    expect(isJobDue(new Date('2026-03-10T11:00:00.000Z'), now, 3600)).toBe(true);
    expect(isJobDue(new Date('2026-03-10T08:00:00.000Z'), now, 3600)).toBe(true);
  });
});

describe('isValidJobName', () => {
  it.each(['example.noop', 'maintenance.cleanup', 'billing.generate', 'billing.mark-overdue'])(
    'RF-000-14: acepta "%s"',
    (name) => {
      expect(isValidJobName(name)).toBe(true);
    },
  );

  it.each(['', 'noop', 'Billing.generate', 'billing.', '.noop', 'a b.c', 'a..b', 'x'.repeat(101)])(
    'RF-000-14: rechaza "%s"',
    (name) => {
      expect(isValidJobName(name)).toBe(false);
    },
  );

  it('RF-000-14: rechaza lo que no es texto', () => {
    expect(isValidJobName(undefined)).toBe(false);
    expect(isValidJobName(42)).toBe(false);
  });
});

describe('isValidIntervalSeconds', () => {
  it('RF-000-14: acepta enteros mayores o iguales a 0', () => {
    expect(isValidIntervalSeconds(0)).toBe(true);
    expect(isValidIntervalSeconds(3600)).toBe(true);
  });

  it.each([-1, 1.5, Number.NaN, Infinity, '60', undefined])('RF-000-14: rechaza %p', (value) => {
    expect(isValidIntervalSeconds(value)).toBe(false);
  });
});

describe('describeJobError', () => {
  it('RF-000-14: usa solo el nombre del tipo de error, nunca su mensaje', () => {
    const error = new TypeError('usuario ana@example.com con cédula 1234567');

    expect(describeJobError(error)).toBe('TypeError');
  });

  it('RF-000-14: añade el código de PostgreSQL o de red cuando existe', () => {
    expect(describeJobError(Object.assign(new Error('x'), { code: '23001' }))).toBe(
      'Error (23001)',
    );
    expect(describeJobError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBe(
      'Error (ECONNREFUSED)',
    );
  });

  it('RF-000-14: ignora un código con forma inesperada (podría traer datos)', () => {
    expect(describeJobError(Object.assign(new Error('x'), { code: 'a b@c.com' }))).toBe('Error');
  });

  it('RF-000-14: un nombre de error raro se reemplaza por "Error"', () => {
    const error = Object.assign(new Error('x'), { name: 'ana@example.com' });

    expect(describeJobError(error)).toBe('Error');
  });

  it('RF-000-14: algo que no es un Error se describe sin su contenido', () => {
    expect(describeJobError('ana@example.com')).toBe('NonErrorThrown');
    expect(describeJobError(undefined)).toBe('NonErrorThrown');
  });

  it('RF-000-14: el resultado nunca supera el máximo', () => {
    expect(describeJobError(new Error('x')).length).toBeLessThanOrEqual(MAX_ERROR_MESSAGE_LENGTH);
  });
});

describe('isInProcessEnabled', () => {
  it('RF-000-14: solo "true" (texto) o true activan el cron interno', () => {
    expect(isInProcessEnabled('true')).toBe(true);
    expect(isInProcessEnabled(true)).toBe(true);
  });

  it.each(['false', 'TRUE', '1', '', undefined, null, 1])(
    'RF-000-14: %p no activa el cron interno',
    (value) => {
      expect(isInProcessEnabled(value)).toBe(false);
    },
  );
});

describe('parseSimulatedNow', () => {
  it('RF-000-14: una fecha sin hora se toma a las 12:00 UTC', () => {
    expect(parseSimulatedNow('2026-11-15')).toEqual(new Date('2026-11-15T12:00:00.000Z'));
  });

  it('RF-000-14: una fecha y hora ISO con zona se respeta', () => {
    expect(parseSimulatedNow('2026-11-15T03:30:00Z')).toEqual(new Date('2026-11-15T03:30:00.000Z'));
    expect(parseSimulatedNow('2026-11-15T08:00:00-04:00')).toEqual(
      new Date('2026-11-15T12:00:00.000Z'),
    );
  });

  it.each([
    undefined,
    '',
    'ayer',
    '2026-13-01',
    '2026-02-30',
    '2026-11-15T10:00:00',
    '15/11/2026',
    '2026-11-15 10:00',
    20261115,
  ])('RF-000-14: %p no es una fecha simulada válida', (value) => {
    expect(parseSimulatedNow(value)).toBeNull();
  });
});
