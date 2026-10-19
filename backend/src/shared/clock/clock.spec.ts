import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Clock } from './clock.js';
import { ClockModule } from './clock.module.js';
import { FakeClock } from './fake-clock.js';
import { SystemClock } from './system-clock.js';

const START = new Date('2026-03-01T02:00:00.000Z');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe('FakeClock', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('RN-000-01: devuelve el instante inicial fijado, en UTC', () => {
    const clock = new FakeClock(START);

    expect(clock.now().toISOString()).toBe('2026-03-01T02:00:00.000Z');
  });

  it('RN-000-01: advance(ms) mueve el instante exactamente esos milisegundos', () => {
    const clock = new FakeClock(START);

    clock.advance(ONE_DAY_MS + 1500);

    expect(clock.now().toISOString()).toBe('2026-03-02T02:00:01.500Z');
  });

  it('RN-000-01: advance se acumula entre llamadas', () => {
    const clock = new FakeClock(START);

    clock.advance(1000);
    clock.advance(2000);

    expect(clock.now().getTime()).toBe(START.getTime() + 3000);
  });

  it('RN-000-01: no cambia con el reloj real aunque pase el tiempo', () => {
    jest.useFakeTimers({ now: new Date('2020-01-01T00:00:00.000Z') });
    const clock = new FakeClock(START);

    jest.setSystemTime(new Date('2031-12-31T23:59:59.000Z'));

    expect(clock.now().getTime()).toBe(START.getTime());
  });

  it('RN-000-01: el Date devuelto es una copia y no altera el reloj si se modifica', () => {
    const clock = new FakeClock(START);

    clock.now().setUTCFullYear(1999);

    expect(clock.now().getTime()).toBe(START.getTime());
  });

  it('RN-000-01: copia el instante inicial recibido', () => {
    const initial = new Date(START);
    const clock = new FakeClock(initial);

    initial.setUTCFullYear(1999);

    expect(clock.now().getTime()).toBe(START.getTime());
  });

  it('RN-000-01: sin instante inicial usa uno fijo y no el reloj real', () => {
    jest.useFakeTimers({ now: new Date('2020-01-01T00:00:00.000Z') });
    const first = new FakeClock().now().getTime();

    jest.setSystemTime(new Date('2031-12-31T23:59:59.000Z'));

    expect(new FakeClock().now().getTime()).toBe(first);
  });

  it('RN-000-01: rechaza un instante inicial inválido', () => {
    expect(() => new FakeClock(new Date('no es una fecha'))).toThrow(RangeError);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'RN-000-01: advance rechaza %p porque el tiempo solo avanza',
    (ms) => {
      const clock = new FakeClock(START);

      expect(() => clock.advance(ms)).toThrow(RangeError);
      expect(clock.now().getTime()).toBe(START.getTime());
    },
  );
});

describe('SystemClock', () => {
  it('RN-000-01: now() devuelve un Date cercano al reloj real', () => {
    const before = Date.now();

    const value = new SystemClock().now();

    expect(value).toBeInstanceOf(Date);
    expect(value.getTime()).toBeGreaterThanOrEqual(before);
    expect(value.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe('ClockModule', () => {
  it('RN-000-01: provee Clock con SystemClock por defecto', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ClockModule] }).compile();

    expect(moduleRef.get(Clock)).toBeInstanceOf(SystemClock);
  });

  it('RN-000-01: en pruebas Clock se reemplaza por FakeClock', async () => {
    const fake = new FakeClock(START);
    const moduleRef = await Test.createTestingModule({ imports: [ClockModule] })
      .overrideProvider(Clock)
      .useValue(fake)
      .compile();

    expect(moduleRef.get(Clock)).toBe(fake);
  });
});
