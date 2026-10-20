import { render, screen } from '@testing-library/react';
import { MonthlySpendChart, SavingsChart, ServiceSpendChart } from './dashboard-recharts';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const originalRect = HTMLElement.prototype.getBoundingClientRect;

beforeAll(() => {
  // jsdom no trae ResizeObserver ni mide: se simula un contenedor de 640 × 280.
  globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ width: 640, height: 280, top: 0, left: 0, right: 640, bottom: 280, x: 0, y: 0 }) as DOMRect;
});

afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = originalRect;
});

/** Texto de un `<text>` del SVG (Recharts lo parte en `<tspan>` cuando no puede medir). */
const svgText = (text: string) => (_content: string, element: Element | null) => {
  if (element?.tagName.toLowerCase() !== 'text') return false;
  const lines = Array.from(element.querySelectorAll('tspan'), (line) => line.textContent);
  return (lines.length > 0 ? lines.join(' ') : element.textContent) === text;
};

const monthly = [
  { period: '2026-09', totalCents: 7250, paidCents: 7250 },
  { period: '2026-10', totalCents: 4190, paidCents: 2210 },
];

describe('Gráficos del panel con Recharts (spec 006 T018)', () => {
  it('CA-006-12: el gráfico de 12 meses pone sobre cada barra el monto de la API', () => {
    const { container } = render(<MonthlySpendChart data={monthly} />);
    expect(screen.getByText(svgText('Bs 72,50'))).toBeInTheDocument();
    expect(screen.getByText(svgText('Bs 41,90'))).toBeInTheDocument();
    expect(screen.getByText(svgText('sep 2026'))).toBeInTheDocument();
    expect(screen.getByText(svgText('oct 2026'))).toBeInTheDocument();
    // El dibujo se oculta a los lectores de pantalla: los valores están en la tabla.
    expect(container.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
  });

  it('RF-006-10: la serie «Pagado» usa un patrón rayado y la leyenda lo dice en texto', () => {
    const { container } = render(<MonthlySpendChart data={monthly} />);
    expect(container.querySelector('pattern[id^="vq-stripes-"]')).not.toBeNull();
    expect(container.querySelector('path[fill^="url(#vq-stripes-"]')).not.toBeNull();
    expect(screen.getByText('Gasto (sólido)')).toBeInTheDocument();
    expect(screen.getByText('Pagado (rayado)')).toBeInTheDocument();
  });

  it('RF-006-08: el gráfico por servicio etiqueta cada barra con su servicio y monto', () => {
    render(
      <ServiceSpendChart
        data={[
          { groupId: 'g2', serviceName: 'Spotify', costCents: 1980 },
          { groupId: 'g3', serviceName: 'Disney+', costCents: 2210 },
        ]}
      />,
    );
    expect(screen.getByText(svgText('Spotify'))).toBeInTheDocument();
    expect(screen.getByText(svgText('Bs 19,80'))).toBeInTheDocument();
    expect(screen.getByText(svgText('Disney+'))).toBeInTheDocument();
    expect(screen.getByText(svgText('Bs 22,10'))).toBeInTheDocument();
  });

  it('CA-006-21: el ahorro negativo se etiqueta con signo menos y con un patrón de puntos', () => {
    const { container } = render(
      <SavingsChart
        data={[
          { period: '2026-09', savingsCents: 4960, cumulativeCents: 4960 },
          { period: '2026-10', savingsCents: -6210, cumulativeCents: -1250 },
        ]}
      />,
    );
    expect(screen.getByText(svgText('Bs 49,60'))).toBeInTheDocument();
    expect(screen.getByText(svgText('−Bs 12,50'))).toBeInTheDocument();
    expect(container.querySelector('path[fill^="url(#vq-dots-"]')).not.toBeNull();
    expect(screen.getByText(/Negativo: cuesta más que el plan individual/)).toBeInTheDocument();
  });
});
