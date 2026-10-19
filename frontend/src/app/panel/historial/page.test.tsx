import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { saveBlob } from '@/lib/download';
import { isPublicPath } from '@/lib/routes';
import { listGroups } from '@/services/groups';
import { ApiError } from '@/services/http';
import { exportHistoryCsv, listHistory, type HistoryItem } from '@/services/reports';
import HistoryPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/panel/historial',
}));
jest.mock('@/services/reports', () => ({
  listHistory: jest.fn(),
  exportHistoryCsv: jest.fn(),
}));
jest.mock('@/services/groups', () => ({ listGroups: jest.fn() }));
jest.mock('@/lib/download', () => ({ saveBlob: jest.fn() }));

const mockedHistory = jest.mocked(listHistory);
const mockedExport = jest.mocked(exportHistoryCsv);
const mockedGroups = jest.mocked(listGroups);
const mockedSave = jest.mocked(saveBlob);

function item(overrides: Partial<HistoryItem> = {}): HistoryItem {
  return {
    chargeId: 'c1',
    period: '2026-10',
    groupId: 'g2',
    groupName: 'Spotify depa',
    serviceName: 'Spotify',
    amountCents: 1980,
    status: 'pendiente',
    origin: 'ciclo',
    dueDate: '2026-10-21',
    paidAt: null,
    ...overrides,
  };
}

const pending = item();
const paidEntry = item({
  chargeId: 'c2',
  period: '2026-09',
  status: 'pagado',
  origin: 'ingreso',
  dueDate: '2026-09-21',
  paidAt: '2026-09-18T15:00:00.000Z',
});
const cancelled = item({
  chargeId: 'c3',
  period: '2026-08',
  groupId: 'g9',
  groupName: 'Paramount+ del curso',
  serviceName: 'Paramount+',
  status: 'cancelado',
  amountCents: 1420,
  dueDate: '2026-08-08',
});

function renderPage() {
  const user = userEvent.setup();
  render(<HistoryPage />);
  return user;
}

const table = () => screen.findByRole('table', { name: 'Tu historial de cobros' });

beforeEach(() => {
  replace.mockReset();
  mockedHistory.mockReset();
  mockedExport.mockReset();
  mockedSave.mockReset();
  mockedGroups.mockReset();
  mockedGroups.mockResolvedValue({
    items: [{ id: 'g2', name: 'Spotify depa' }] as never[],
    nextCursor: null,
  });
  mockedHistory.mockResolvedValue({ items: [pending, paidEntry, cancelled], nextCursor: null });
});

describe('/panel/historial (spec 006 T026)', () => {
  it('RF-006-13: el título es "Historial", la ruta es protegida y pide la primera página', async () => {
    expect(metadata.title).toBe('Historial');
    expect(isPublicPath('/panel/historial')).toBe(false);
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Historial' })).toBeVisible();
    await table();
    expect(mockedHistory).toHaveBeenCalledWith({ limit: 25 });
    expect(screen.getByRole('link', { name: 'Volver al panel' })).toHaveAttribute('href', '/panel');
  });

  it('RF-006-13: mientras carga muestra el esqueleto', () => {
    mockedHistory.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Cargando tu historial…')).toBeInTheDocument();
  });

  it('RF-006-13: cada fila muestra mes, servicio, monto, estado con texto, vencimiento y fecha de pago', async () => {
    renderPage();
    const rows = within(await table()).getAllByRole('row');
    expect(rows.map((row) => row.textContent)).toEqual([
      'PeríodoSuscripciónMontoEstadoVencePagado el',
      'Octubre 2026Spotify depaSpotifyBs 19,80Pendiente21 oct 2026—Sin pago',
      'Septiembre 2026Spotify depaSpotify · Pago de ingresoBs 19,80Pagado21 sep 202618 sep 2026',
      'Agosto 2026Paramount+ del cursoParamount+Bs 14,20Cancelado8 ago 2026—Sin pago',
    ]);
    expect(within(rows[1]).getByRole('link', { name: /Spotify depa/ })).toHaveAttribute(
      'href',
      '/cobros/c1',
    );
  });

  it('RF-006-13: los filtros de mes, suscripción y estado los aplica la API', async () => {
    const user = renderPage();
    await table();
    await user.type(screen.getByLabelText('Mes'), '2026-09');
    await waitFor(() =>
      expect(mockedHistory).toHaveBeenLastCalledWith({ period: '2026-09', limit: 25 }),
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Suscripción' }), 'g2');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'pagado');
    expect(mockedHistory).toHaveBeenLastCalledWith({
      period: '2026-09',
      groupId: 'g2',
      status: 'pagado',
      limit: 25,
    });
  });

  it('RF-006-13: «Cargar más» pide la siguiente página con el cursor', async () => {
    mockedHistory
      .mockResolvedValueOnce({ items: [pending], nextCursor: 'k2' })
      .mockResolvedValueOnce({ items: [cancelled], nextCursor: null });
    const user = renderPage();
    await table();
    await user.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(mockedHistory).toHaveBeenLastCalledWith({ limit: 25, cursor: 'k2' });
    expect(await screen.findByText('Paramount+ del curso')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();
  });

  it('RF-006-13: vacío sin filtros y con filtros', async () => {
    mockedHistory.mockResolvedValue({ items: [], nextCursor: null });
    const user = renderPage();
    expect(await screen.findByRole('heading', { name: 'Aún no tienes cobros' })).toBeVisible();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'atrasado');
    expect(
      await screen.findByRole('heading', { name: 'No hay cobros con estos filtros' }),
    ).toBeVisible();
  });

  it('RF-006-13: un error muestra el aviso con Reintentar', async () => {
    mockedHistory
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'))
      .mockResolvedValue({ items: [pending], nextCursor: null });
    const user = renderPage();
    expect(await screen.findByText('No pudimos cargar tu historial.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await table()).toBeInTheDocument();
  });

  it('RF-006-14: «Exportar CSV» descarga con los filtros y el nombre de archivo del servidor', async () => {
    const blob = new Blob(['﻿periodo\n'], { type: 'text/csv' });
    mockedExport.mockResolvedValue({ blob, filename: 'vaquita-historial-2026-10-19.csv' });
    const user = renderPage();
    await table();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'pagado');
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(mockedExport).toHaveBeenCalledWith({ status: 'pagado' });
    expect(mockedSave).toHaveBeenCalledWith(blob, 'vaquita-historial-2026-10-19.csv');
    expect(
      await screen.findByText('Descargamos el archivo vaquita-historial-2026-10-19.csv.'),
    ).toBeVisible();
  });

  it('RF-006-14: sin nombre del servidor usa uno por defecto', async () => {
    const blob = new Blob(['x']);
    mockedExport.mockResolvedValue({ blob, filename: null });
    const user = renderPage();
    await table();
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(mockedSave).toHaveBeenCalledWith(blob, 'vaquita-historial.csv');
  });

  it('RF-006-14: un 429 muestra el mensaje de espera con los minutos de retryAfterSeconds', async () => {
    mockedExport.mockRejectedValue(
      new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 600 }),
    );
    const user = renderPage();
    await table();
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(
      await screen.findByText(
        'Llegaste al límite de 10 exportaciones por hora. Vuelve a intentarlo en 10 minutos.',
      ),
    ).toBeVisible();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('RF-006-14: un 429 de menos de un minuto o sin tiempo lo dice igual', async () => {
    mockedExport
      .mockRejectedValueOnce(new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 30 }))
      .mockRejectedValueOnce(new ApiError(429, 'RATE_LIMITED', 'x'));
    const user = renderPage();
    await table();
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(await screen.findByText(/Vuelve a intentarlo en menos de 1 minuto\./)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(await screen.findByText(/Vuelve a intentarlo en un rato\./)).toBeVisible();
  });

  it('RF-006-14: demasiadas filas (422) pide filtrar por mes', async () => {
    mockedExport.mockRejectedValue(
      new ApiError(422, 'BUSINESS_RULE', 'x', { rule: 'EXPORT_TOO_LARGE' }),
    );
    const user = renderPage();
    await table();
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(await screen.findByText(/Filtra por mes y vuelve a exportar/)).toBeVisible();
  });

  it('RF-003-08: un 401 lleva a /ingresar con la ruta actual', async () => {
    mockedHistory.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'x'));
    renderPage();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fpanel%2Fhistorial'),
    );
  });
});
