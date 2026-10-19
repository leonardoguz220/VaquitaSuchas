import { JobRegistry } from './job-registry.js';
import type { ScheduledJob } from './scheduled-job.js';

function job(name: string, intervalSeconds = 0): ScheduledJob {
  return { name, intervalSeconds, run: () => Promise.resolve(0) };
}

describe('JobRegistry', () => {
  it('RF-000-14: lista las tareas en orden de registro y las devuelve por nombre', () => {
    const registry = new JobRegistry();
    const first = job('billing.generate');
    const second = job('billing.overdue');

    registry.register(first);
    registry.register(second);

    expect(registry.list()).toEqual([first, second]);
    expect(registry.get('billing.overdue')).toBe(second);
    expect(registry.get('otra.cosa')).toBeUndefined();
  });

  it('RF-000-14: rechaza un nombre de tarea repetido', () => {
    const registry = new JobRegistry();
    registry.register(job('billing.generate'));

    expect(() => registry.register(job('billing.generate'))).toThrow(
      /Ya existe una tarea registrada con el nombre "billing.generate"/,
    );
    expect(registry.list()).toHaveLength(1);
  });

  it('RF-000-14: rechaza un nombre inválido', () => {
    expect(() => new JobRegistry().register(job('SinNamespace'))).toThrow(
      /Nombre de tarea inválido/,
    );
  });

  it('RF-000-14: rechaza un intervalSeconds que no es un entero >= 0', () => {
    const registry = new JobRegistry();

    expect(() => registry.register(job('a.b', -1))).toThrow(/intervalSeconds/);
    expect(() => registry.register(job('a.c', 1.5))).toThrow(/intervalSeconds/);
  });

  it('RF-000-14: modificar la lista devuelta no altera el registro', () => {
    const registry = new JobRegistry();
    registry.register(job('a.b'));

    registry.list().pop();

    expect(registry.list()).toHaveLength(1);
  });
});
