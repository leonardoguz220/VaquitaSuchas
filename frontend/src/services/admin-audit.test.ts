import * as audit from './admin-audit';
import { listAuditLog } from './admin-audit';
import { resetAuditMock } from './admin-audit.mock';

async function run<T>(promise: Promise<T>): Promise<T> {
  const pending = promise;
  await jest.advanceTimersByTimeAsync(400);
  return pending;
}

describe('services/admin-audit.ts (spec 009 T024)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetAuditMock();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('CA-009-18: cada entrada trae autor, acción, fecha y motivo cuando la acción lo exige', async () => {
    const page = await run(listAuditLog({ limit: 50 }));

    for (const entry of page.items) {
      expect(entry.adminName).not.toBe('');
      expect(entry.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(entry.action).toBeTruthy();
    }
    const ban = page.items.find((entry) => entry.action === 'usuario_banear');
    expect(ban?.reason).toEqual(expect.any(String));
    const resolved = page.items.find((entry) => entry.action === 'reclamo_abrir_evidencia');
    expect(resolved?.reason).toBeNull();
  });

  it('CA-009-18: va de la entrada más reciente a la más antigua', async () => {
    const page = await run(listAuditLog({ limit: 50 }));
    const times = page.items.map((entry) => Date.parse(entry.occurredAt));
    for (let index = 1; index < times.length; index += 1) {
      expect(times[index]).toBeLessThan(times[index - 1]);
    }
  });

  it('CA-009-19: el módulo no ofrece ninguna operación para editar ni borrar el log', () => {
    const functions = Object.entries(audit)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);
    expect(functions).toEqual(['listAuditLog']);
    expect(
      functions.filter((name) => /edit|update|patch|put|delete|borr|elimin|remove/i.test(name)),
    ).toEqual([]);
  });

  it('RF-009-18: filtra por acción', async () => {
    const page = await run(listAuditLog({ action: 'reclamo_resolver', limit: 50 }));
    expect(page.items).toHaveLength(2);
    expect(page.items.every((entry) => entry.action === 'reclamo_resolver')).toBe(true);
  });

  it('RF-009-18: filtra por rango de días en hora de La Paz', async () => {
    const page = await run(listAuditLog({ from: '2026-10-19', to: '2026-10-19', limit: 50 }));
    expect(page.items.map((entry) => entry.id)).toEqual(['aud-001', 'aud-002']);
  });

  it('RF-009-18: pagina con cursor y termina con nextCursor en null', async () => {
    const first = await run(listAuditLog({ limit: 10 }));
    expect(first.items).toHaveLength(10);
    expect(first.nextCursor).toBe('10');

    const second = await run(listAuditLog({ limit: 10, cursor: first.nextCursor ?? undefined }));
    expect(second.items).toHaveLength(10);
    expect(second.items[0].id).toBe('aud-011');
    expect(second.nextCursor).toBe('20');

    const last = await run(listAuditLog({ limit: 10, cursor: second.nextCursor ?? undefined }));
    expect(last.items).toHaveLength(4);
    expect(last.nextCursor).toBeNull();
  });
});
