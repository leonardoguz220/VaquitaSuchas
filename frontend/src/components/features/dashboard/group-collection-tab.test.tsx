import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { saveBlob } from '@/lib/download';
import { collection } from '@/services/__fixtures__/reports';
import { ApiError } from '@/services/http';
import {
  exportGroupHistoryCsv,
  getGroupCollection,
  type GroupCollection,
} from '@/services/reports';
import { GroupCollectionTab } from './group-collection-tab';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/grupos/g2',
}));
jest.mock('@/services/reports', () => ({
  getGroupCollection: jest.fn(),
  exportGroupHistoryCsv: jest.fn(),
}));
jest.mock('@/lib/download', () => ({ saveBlob: jest.fn() }));

describe('GroupCollectionTab en /grupos/[id] (spec 006 T014): pestaña Cobranza del titular', () => {
  const mockedCollection = jest.mocked(getGroupCollection);
  const october: GroupCollection = {
    ...collection({ groupId: 'g2', groupName: 'Spotify depa', serviceName: 'Spotify' }),
    availablePeriods: ['2026-10', '2026-09'],
    members: [
      {
        userId: 'u2',
        fullName: 'Ana Quispe Mamani',
        chargeId: 'p1',
        amountCents: 1980,
        status: 'pagado',
      },
      {
        userId: 'u5',
        fullName: 'Luis Mamani',
        chargeId: 'c9',
        amountCents: 1500,
        status: 'atrasado',
      },
    ],
  };

  async function openCollection() {
    const actor = userEvent.setup();
    const view = render(<GroupCollectionTab groupId="g2" />);
    return Object.assign(actor, {
      unmount: view.unmount,
      rerender: () => view.rerender(<GroupCollectionTab key="again" groupId="g2" />),
    });
  }

  beforeEach(() => mockedCollection.mockReset());

  it('CA-006-09: muestra esperado, cobrado, 67 % en texto y Bs 30,00 pendiente que da la API', async () => {
    mockedCollection.mockResolvedValue(october);
    await openCollection();
    const card = await screen.findByRole('region', { name: 'Spotify depa' });
    expect(mockedCollection).toHaveBeenCalledWith('g2', undefined);
    expect(card).toHaveTextContent('Cobrado Bs 60,00 de Bs 90,00 · 67 %');
    expect(within(card).getByText('Pendiente').nextSibling).toHaveTextContent('Bs 30,00');
    expect(within(card).getByText('Esperado').nextSibling).toHaveTextContent('Bs 90,00');
  });

  it('RF-006-06: lista los atrasados con días de atraso y enlace a revisar', async () => {
    mockedCollection.mockResolvedValue(october);
    await openCollection();
    const late = await screen.findByRole('list', { name: 'Atrasados de Spotify depa' });
    expect(late).toHaveTextContent(
      'Luis Mamani · Bs 15,00 · venció el 8 oct 2026 · 11 días de atraso',
    );
    expect(
      within(late).getByRole('link', { name: 'Revisar el cobro de Luis Mamani' }),
    ).toHaveAttribute('href', '/cobros/c9');
  });

  it('RF-006-06: la tabla por miembro muestra monto y estado con texto, y se filtra por miembro', async () => {
    mockedCollection.mockResolvedValue(october);
    const actor = await openCollection();
    const table = await screen.findByRole('table', { name: 'Cobros por miembro de Octubre 2026' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Pagado')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Atrasado')).toBeInTheDocument();
    expect(
      within(rows[1]).getByRole('link', { name: 'Ver el cobro de Luis Mamani' }),
    ).toHaveAttribute('href', '/cobros/c9');
    await actor.selectOptions(screen.getByRole('combobox', { name: 'Miembro' }), 'u5');
    expect(within(table).getAllByRole('row').slice(1)).toHaveLength(1);
    expect(within(table).queryByText('Ana Quispe Mamani')).toBeNull();
  });

  it('RF-006-06: el selector de mes usa los períodos de la API y pide la cobranza del elegido', async () => {
    mockedCollection.mockResolvedValueOnce(october).mockResolvedValue({
      ...october,
      period: '2026-09',
      percentCollected: null,
      expectedCents: 0,
      collectedCents: 0,
      lateMembers: [],
      members: [],
    });
    const actor = await openCollection();
    await screen.findByRole('region', { name: 'Spotify depa' });
    await actor.selectOptions(screen.getByRole('combobox', { name: 'Mes' }), '2026-09');
    expect(mockedCollection).toHaveBeenLastCalledWith('g2', '2026-09');
    const card = await screen.findByRole('region', { name: 'Spotify depa' });
    expect(card).toHaveTextContent('Cobrado Bs 0,00 de Bs 0,00 · sin monto esperado');
    expect(screen.getByText('Nadie está atrasado.')).toBeInTheDocument();
    expect(screen.getByText('No hay cobros de miembros en Septiembre 2026.')).toBeInTheDocument();
  });

  it('RF-006-06: mientras carga muestra el esqueleto; con error ofrece Reintentar; 403 no', async () => {
    mockedCollection
      .mockReturnValueOnce(new Promise(() => {}))
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'))
      .mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'x'));
    const actor = await openCollection();
    expect(screen.getByText('Cargando la cobranza…')).toBeInTheDocument();
    actor.rerender();
    expect(await screen.findByText('No pudimos cargar la cobranza.')).toBeVisible();
    await actor.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Solo el titular del grupo ve la cobranza.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });

  describe('Exportar CSV del grupo (spec 006 T026)', () => {
    const mockedExport = jest.mocked(exportGroupHistoryCsv);
    const mockedSave = jest.mocked(saveBlob);

    beforeEach(() => {
      mockedExport.mockReset();
      mockedSave.mockReset();
    });

    it('RF-006-14: exporta el mes mostrado y el miembro filtrado con el nombre del servidor', async () => {
      const blob = new Blob(['x'], { type: 'text/csv' });
      mockedCollection.mockResolvedValue(october);
      mockedExport.mockResolvedValue({ blob, filename: 'vaquita-grupo-2026-10.csv' });
      const actor = await openCollection();
      await screen.findByRole('table', { name: 'Cobros por miembro de Octubre 2026' });
      await actor.click(screen.getByRole('button', { name: 'Exportar CSV del grupo' }));
      expect(mockedExport).toHaveBeenLastCalledWith('g2', { period: '2026-10' });
      expect(mockedSave).toHaveBeenCalledWith(blob, 'vaquita-grupo-2026-10.csv');
      await actor.selectOptions(screen.getByRole('combobox', { name: 'Miembro' }), 'u5');
      await actor.click(screen.getByRole('button', { name: 'Exportar CSV del grupo' }));
      expect(mockedExport).toHaveBeenLastCalledWith('g2', { period: '2026-10', userId: 'u5' });
    });

    it('CA-006-17: si la API responde 403 explica que solo el titular exporta el grupo', async () => {
      mockedCollection.mockResolvedValue(october);
      mockedExport.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
      const actor = await openCollection();
      await screen.findByRole('table', { name: 'Cobros por miembro de Octubre 2026' });
      await actor.click(screen.getByRole('button', { name: 'Exportar CSV del grupo' }));
      expect(
        await screen.findByText('Solo el titular puede exportar el historial del grupo.'),
      ).toBeVisible();
      expect(mockedSave).not.toHaveBeenCalled();
    });

    it('RF-006-14: un 429 muestra la espera', async () => {
      mockedCollection.mockResolvedValue(october);
      mockedExport.mockRejectedValue(
        new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 61 }),
      );
      const actor = await openCollection();
      await screen.findByRole('table', { name: 'Cobros por miembro de Octubre 2026' });
      await actor.click(screen.getByRole('button', { name: 'Exportar CSV del grupo' }));
      expect(await screen.findByText(/Vuelve a intentarlo en 2 minutos\./)).toBeVisible();
    });
  });
});
