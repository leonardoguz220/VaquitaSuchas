import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SystemStatus } from '@/components/features/status/system-status';
import { HEALTH_TIMEOUT_MS } from '@/hooks/use-health';
import { getHealth, type HealthResponse } from '@/services/health';
import { ApiError } from '@/services/http';
import StatusPage, { metadata } from './page';

jest.mock('@/services/health', () => ({ getHealth: jest.fn() }));

const mockedGetHealth = jest.mocked(getHealth);

const healthy: HealthResponse = {
  status: 'ok',
  version: '0.1.0',
  uptimeSeconds: 1234,
  database: { status: 'up', latencyMs: 4 },
  // 17:00 UTC son las 13:00 en La Paz.
  time: '2026-10-18T17:00:00.000Z',
};

const degraded: HealthResponse = {
  ...healthy,
  status: 'degraded',
  database: { status: 'down', latencyMs: null },
};

const UNREACHABLE = 'No se pudo contactar con el servidor.';

function card(name: string) {
  return within(screen.getByRole('region', { name }));
}

function expectCardStatus(name: string, label: string) {
  expect(card(name).getByText(label)).toBeInTheDocument();
}

async function flush() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

function renderPage() {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<StatusPage />);
  return user;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockedGetHealth.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('/estado (T039, RF-000-18, plan 000 §6)', () => {
  it('RF-000-18: el título de la pestaña es "Estado del sistema"', () => {
    expect(metadata.title).toBe('Estado del sistema');
  });

  it('RF-000-18: mientras carga muestra el esqueleto de 3 tarjetas', () => {
    mockedGetHealth.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Estado del sistema' })).toBeVisible();
    expect(screen.getByText('Consultando el estado del sistema…')).toBeInTheDocument();
    expect(screen.getAllByTestId('status-skeleton-card')).toHaveLength(3);
    expect(screen.queryByRole('region', { name: 'Backend' })).not.toBeInTheDocument();
  });

  it('CA-000-10: con backend y base arriba, las tres tarjetas muestran OK con su detalle', async () => {
    mockedGetHealth.mockResolvedValue(healthy);
    renderPage();
    await flush();

    expectCardStatus('Frontend', 'OK');
    expectCardStatus('Backend', 'OK');
    expectCardStatus('Base de datos', 'OK');
    expect(card('Backend').getByText(/Versión 0\.1\.0/)).toBeInTheDocument();
    expect(card('Base de datos').getByText('Respondió en 4 ms.')).toBeInTheDocument();
    expect(screen.getByText('18 oct 2026, 13:00')).toHaveAttribute('dateTime', healthy.time);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('status-skeleton-card')).not.toBeInTheDocument();
  });

  it('CA-000-10: si el backend responde degradado (base caída) avisa y no deja la pantalla en blanco', async () => {
    mockedGetHealth.mockResolvedValue(degraded);
    renderPage();
    await flush();

    expectCardStatus('Frontend', 'OK');
    expectCardStatus('Backend', 'Degradado');
    expectCardStatus('Base de datos', 'Sin respuesta');
    expect(card('Base de datos').queryByText(/ms\./)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('La base de datos no responde.');
    expect(screen.queryByText(UNREACHABLE)).not.toBeInTheDocument();
  });

  it('RF-000-18: si la petición falla muestra el aviso, Backend "Sin respuesta" y Reintentar', async () => {
    mockedGetHealth.mockRejectedValue(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    renderPage();
    await flush();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(UNREACHABLE);
    expect(within(alert).getByRole('button', { name: 'Reintentar' })).toBeEnabled();
    expectCardStatus('Frontend', 'OK');
    expectCardStatus('Backend', 'Sin respuesta');
    expectCardStatus('Base de datos', 'Sin respuesta');
  });

  it('RF-000-18: si el backend tarda más de 5 s muestra el aviso de conexión', async () => {
    mockedGetHealth.mockReturnValue(new Promise(() => {}));
    renderPage();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(HEALTH_TIMEOUT_MS - 1);
    });
    expect(screen.queryByText(UNREACHABLE)).not.toBeInTheDocument();
    expect(screen.getAllByTestId('status-skeleton-card')).toHaveLength(3);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(UNREACHABLE);
    expectCardStatus('Backend', 'Sin respuesta');
  });

  it('RF-000-18: el tiempo máximo del componente se puede inyectar', async () => {
    mockedGetHealth.mockReturnValue(new Promise(() => {}));
    render(<SystemStatus timeoutMs={20} />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(UNREACHABLE);
  });

  it('RF-000-18: Reintentar tras el error vuelve a consultar y muestra el resultado', async () => {
    mockedGetHealth
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'))
      .mockResolvedValueOnce(healthy);
    const user = renderPage();
    await flush();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await flush();

    expect(mockedGetHealth).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectCardStatus('Backend', 'OK');
    expectCardStatus('Base de datos', 'OK');
  });

  it('RF-000-18: Reintentar también está disponible con un resultado y actualiza las tarjetas', async () => {
    mockedGetHealth.mockResolvedValueOnce(healthy).mockResolvedValueOnce(degraded);
    const user = renderPage();
    await flush();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await flush();

    expect(mockedGetHealth).toHaveBeenCalledTimes(2);
    expectCardStatus('Backend', 'Degradado');
  });

  it('RF-000-18: cada estado lleva texto además del color (ícono decorativo y etiqueta)', async () => {
    mockedGetHealth.mockResolvedValue(degraded);
    renderPage();
    await flush();

    for (const name of ['Frontend', 'Backend', 'Base de datos']) {
      const region = screen.getByRole('region', { name });
      expect(region.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
  });
});
