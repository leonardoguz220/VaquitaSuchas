'use client';

import { useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { useCsvDownload } from '@/hooks/use-dashboard';
import type { ApiError } from '@/services/http';
import type { ApiDownload } from '@/services/reports';
import { exportErrorMessage } from './dashboard-messages';

type Outcome = { ok: true; filename: string } | { ok: false; error: ApiError } | null;

/**
 * Botón de exportación a CSV (RF-006-14): descarga el archivo con el nombre del servidor y
 * avisa el resultado. Un `429` muestra el tiempo de espera (plan 006 §6). `request` debe ser
 * estable (`useCallback`).
 */
export function ExportCsvButton({
  label,
  request,
  fallbackName,
}: {
  label: string;
  request: () => Promise<ApiDownload>;
  fallbackName: string;
}) {
  const { submit, isSubmitting } = useCsvDownload(request, fallbackName);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const onClick = async () => {
    setOutcome(null);
    const result = await submit(undefined);
    if (!result) return;
    setOutcome(result.ok ? { ok: true, filename: result.data.filename } : result);
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        onClick={() => void onClick()}
        loading={isSubmitting}
        className="self-start"
      >
        {label}
      </Button>
      {outcome?.ok && <Alert variant="success">Descargamos el archivo {outcome.filename}.</Alert>}
      {outcome && !outcome.ok && (
        <Alert variant="error" title="No pudimos exportar el CSV.">
          {exportErrorMessage(outcome.error)}
        </Alert>
      )}
    </div>
  );
}
