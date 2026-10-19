'use client';

/**
 * Gráficos del panel con Recharts (plan 006 §2, decisión 10; §6). Este módulo se carga con
 * `next/dynamic` y sin SSR desde `dashboard-charts.tsx`, para no sumar Recharts al primer
 * paquete. Solo dibuja los centavos que entrega la API: las etiquetas de valor usan `formatBs` y
 * las series se distinguen con patrones y texto además del color (RF-006-10). Cada gráfico tiene
 * su tabla alternativa fuera de este módulo.
 */
import { useId, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { formatPeriodShort } from '@/lib/dates';
import { formatBs, formatSignedBs } from '@/lib/money';
import type { DashboardCharts } from '@/services/reports';

const COLOR = {
  primary: '#1e6b4e',
  primaryDark: '#14503a',
  primarySoft: '#e3f1ea',
  danger: '#9b1c12',
  dangerSoft: '#fbdcd8',
  ink: '#17201c',
  muted: '#4f5a55',
  line: '#d9ddd7',
};

/** Tamaño inicial antes de medir el contenedor (y en entornos sin `ResizeObserver`). */
const INITIAL_DIMENSION = { width: 640, height: 280 };

const AXIS_TICK = { fill: COLOR.muted, fontSize: 12 };
/** Etiquetas de valor sobre las barras. */
const LABEL_PROPS = { fill: COLOR.ink, fontSize: 11, fontWeight: 700 } as const;

/** `useId` devuelve caracteres que no sirven en `url(#…)`. */
function usePatternIds() {
  const base = useId().replace(/[^a-zA-Z0-9]/g, '');
  return { stripes: `vq-stripes-${base}`, dots: `vq-dots-${base}` };
}

function Patterns({ ids }: { ids: { stripes: string; dots: string } }) {
  return (
    <defs>
      <pattern
        id={ids.stripes}
        width="8"
        height="8"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="8" height="8" fill={COLOR.primarySoft} />
        <rect width="4" height="8" fill={COLOR.primaryDark} />
      </pattern>
      <pattern id={ids.dots} width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill={COLOR.dangerSoft} />
        <circle cx="3" cy="3" r="1.6" fill={COLOR.danger} />
      </pattern>
    </defs>
  );
}

/** Leyenda en HTML con la muestra de cada serie (color y patrón) y su nombre en texto. */
function Legend({ items }: { items: Array<{ label: string; swatch: ReactNode }> }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[15px]">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-2">
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 shrink-0">
            {item.swatch}
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

const centsLabel = (value: unknown) => formatBs(Number(value));
const signedCentsLabel = (value: unknown) => formatSignedBs(Number(value));

/**
 * Alto mínimo de cada barra en px: sin él, Recharts no dibuja la barra de valor 0 ni su etiqueta
 * y el gráfico mostraría un valor menos que su tabla (CA-006-12).
 */
const MIN_BAR_SIZE = 2;

/** Gasto de los últimos 12 meses: total comprometido (sólido) y pagado (rayado). RF-006-07. */
export function MonthlySpendChart({ data }: { data: DashboardCharts['monthly'] }) {
  const ids = usePatternIds();
  const rows = data.map((item) => ({ ...item, label: formatPeriodShort(item.period) }));
  return (
    <div className="flex flex-col gap-3">
      <div aria-hidden="true" className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
          <BarChart
            accessibilityLayer={false}
            data={rows}
            margin={{ top: 24, right: 8, bottom: 8, left: 8 }}
          >
            <Patterns ids={ids} />
            <CartesianGrid vertical={false} stroke={COLOR.line} />
            <XAxis
              dataKey="label"
              interval={0}
              angle={-45}
              textAnchor="end"
              height={56}
              tick={AXIS_TICK}
            />
            <YAxis hide />
            <Bar
              minPointSize={MIN_BAR_SIZE}
              dataKey="totalCents"
              name="Gasto"
              fill={COLOR.primary}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="totalCents"
                position="top"
                formatter={centsLabel}
                {...LABEL_PROPS}
              />
            </Bar>
            <Bar
              dataKey="paidCents"
              name="Pagado"
              fill={`url(#${ids.stripes})`}
              stroke={COLOR.primaryDark}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          { label: 'Gasto (sólido)', swatch: <rect width="16" height="16" fill={COLOR.primary} /> },
          {
            label: 'Pagado (rayado)',
            swatch: (
              <>
                <rect width="16" height="16" fill={COLOR.primarySoft} stroke={COLOR.primaryDark} />
                <path
                  d="M0 16 16 0M-4 4 4-4M12 20 20 12"
                  stroke={COLOR.primaryDark}
                  strokeWidth="3"
                />
              </>
            ),
          },
        ]}
      />
    </div>
  );
}

/** Gasto del mes por servicio, en barras horizontales con su monto al final. RF-006-08. */
export function ServiceSpendChart({ data }: { data: DashboardCharts['byService'] }) {
  const height = Math.max(160, data.length * 52 + 24);
  return (
    <div aria-hidden="true" className="w-full" style={{ height }}>
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: INITIAL_DIMENSION.width, height }}
      >
        <BarChart
          accessibilityLayer={false}
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 88, bottom: 8, left: 8 }}
        >
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="serviceName" width={112} interval={0} tick={AXIS_TICK} />
          <Bar
            minPointSize={MIN_BAR_SIZE}
            dataKey="costCents"
            name="Gasto"
            fill={COLOR.primary}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="costCents"
              position="right"
              formatter={centsLabel}
              {...LABEL_PROPS}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Ahorro acumulado de los últimos 12 meses (RF-006-09): barras sólidas si es positivo y con
 * puntos si es negativo, con la etiqueta con signo (CA-006-21).
 */
export function SavingsChart({ data }: { data: DashboardCharts['savings'] }) {
  const ids = usePatternIds();
  const rows = data.map((item) => ({ ...item, label: formatPeriodShort(item.period) }));
  return (
    <div className="flex flex-col gap-3">
      <div aria-hidden="true" className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
          <BarChart
            accessibilityLayer={false}
            data={rows}
            margin={{ top: 24, right: 8, bottom: 8, left: 8 }}
          >
            <Patterns ids={ids} />
            <CartesianGrid vertical={false} stroke={COLOR.line} />
            <XAxis
              dataKey="label"
              interval={0}
              angle={-45}
              textAnchor="end"
              height={56}
              tick={AXIS_TICK}
            />
            <YAxis hide />
            <ReferenceLine y={0} stroke={COLOR.ink} />
            <Bar
              minPointSize={MIN_BAR_SIZE}
              dataKey="cumulativeCents"
              name="Ahorro acumulado"
              isAnimationActive={false}
            >
              {rows.map((item) => (
                <Cell
                  key={item.period}
                  fill={item.cumulativeCents < 0 ? `url(#${ids.dots})` : COLOR.primary}
                  stroke={item.cumulativeCents < 0 ? COLOR.danger : COLOR.primary}
                />
              ))}
              <LabelList
                dataKey="cumulativeCents"
                position="top"
                formatter={signedCentsLabel}
                {...LABEL_PROPS}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          {
            label: 'Ahorro (sólido)',
            swatch: <rect width="16" height="16" fill={COLOR.primary} />,
          },
          {
            label: 'Negativo: cuesta más que el plan individual (con puntos)',
            swatch: (
              <>
                <rect width="16" height="16" fill={COLOR.dangerSoft} stroke={COLOR.danger} />
                <circle cx="5" cy="5" r="1.8" fill={COLOR.danger} />
                <circle cx="11" cy="11" r="1.8" fill={COLOR.danger} />
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
