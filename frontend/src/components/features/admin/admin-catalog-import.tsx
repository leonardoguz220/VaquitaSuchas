'use client';

import { useId, useState, type ChangeEvent } from 'react';
import { Alert, Button, Card } from '@/components/ui';
import type { ApiSubmitResult } from '@/hooks/use-api-submit';
import type {
  CatalogImportApplied,
  CatalogImportFormat,
  CatalogImportPreview,
} from '@/services/admin-catalog';

export interface AdminCatalogImportProps {
  importPreview: (
    format: CatalogImportFormat,
    content: string,
  ) => Promise<ApiSubmitResult<CatalogImportPreview> | null>;
  importApply: (token: string) => Promise<ApiSubmitResult<CatalogImportApplied> | null>;
  isPreviewing: boolean;
  isApplying: boolean;
  /** Llamado tras aplicar; `message` es el resumen para la pantalla. */
  onApplied: (message: string) => void;
}

/**
 * Importación del catálogo (RF-009-06, CA-009-06): se sube un CSV o JSON, se revisa la vista previa
 * y solo entonces se aplica. Si alguna fila tiene errores no hay botón para aplicar: todo o nada.
 */
export function AdminCatalogImport({
  importPreview,
  importApply,
  isPreviewing,
  isApplying,
  onApplied,
}: AdminCatalogImportProps) {
  const inputId = useId();
  const [fileName, setFileName] = useState<string | null>(null);
  const [format, setFormat] = useState<CatalogImportFormat | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [preview, setPreview] = useState<CatalogImportPreview | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(null);
    setErrorText(null);
    if (!file) {
      setFileName(null);
      setFormat(null);
      setContent(null);
      return;
    }
    const name = file.name.toLowerCase();
    const detected: CatalogImportFormat | null = name.endsWith('.csv')
      ? 'csv'
      : name.endsWith('.json')
        ? 'json'
        : null;
    if (!detected) {
      setFileName(null);
      setFormat(null);
      setContent(null);
      setErrorText('Elige un archivo .csv o .json.');
      return;
    }
    setFileName(file.name);
    setFormat(detected);
    setContent(await readText(file));
  }

  async function handlePreview() {
    if (!format || content === null) return;
    setErrorText(null);
    const outcome = await importPreview(format, content);
    if (!outcome) return;
    if (outcome.ok) setPreview(outcome.data);
    else setErrorText(outcome.error.message);
  }

  async function handleApply() {
    if (!preview?.token) return;
    setErrorText(null);
    const outcome = await importApply(preview.token);
    if (!outcome) return;
    if (!outcome.ok) {
      setErrorText(outcome.error.message);
      return;
    }
    const { created, updated } = outcome.data;
    onApplied(`Importación aplicada: ${created} creados, ${updated} actualizados.`);
    setPreview(null);
    setFileName(null);
    setFormat(null);
    setContent(null);
  }

  const hasErrors = preview !== null && preview.errors.length > 0;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">Importar catálogo</h2>
        <p className="text-sm text-muted">
          Sube un archivo CSV o JSON y revisa la vista previa. Si una fila tiene errores, no se
          aplica ningún cambio.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-bold">
          Archivo CSV o JSON
        </label>
        <input
          id={inputId}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={handleFile}
          disabled={isPreviewing || isApplying}
          className="text-sm"
        />
        {fileName && <span className="text-sm text-muted">Archivo: {fileName}</span>}
      </div>

      <div>
        <Button
          variant="secondary"
          onClick={handlePreview}
          disabled={content === null || isPreviewing || isApplying}
          loading={isPreviewing}
        >
          Ver vista previa
        </Button>
      </div>

      {errorText && <Alert variant="error">{errorText}</Alert>}

      {preview && (
        <div className="flex flex-col gap-3">
          {hasErrors ? (
            <Alert
              variant="error"
              title={`Hay ${preview.errors.length} errores. No se aplica nada.`}
            >
              Corrige estas filas y vuelve a subir el archivo.
            </Alert>
          ) : (
            <Alert variant="success">
              Vista previa sin errores. Revisa los cambios antes de aplicar.
            </Alert>
          )}

          {preview.errors.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label="Errores por fila">
              {preview.errors.map((error, index) => (
                <li
                  key={`${error.row}-${error.field}-${index}`}
                  className="rounded-field border border-line p-3 text-sm"
                >
                  Fila {error.row}, campo {error.field}: {error.message}
                </li>
              ))}
            </ul>
          )}

          {preview.changes.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label="Cambios previstos">
              {preview.changes.map((change) => (
                <li
                  key={`${change.kind}-${change.slug}-${change.row}`}
                  className="rounded-field border border-line p-3 text-sm"
                >
                  Fila {change.row}: {change.kind} {change.slug} ·{' '}
                  {change.action === 'crear' ? 'se crea' : 'se actualiza'}
                </li>
              ))}
            </ul>
          )}

          {!hasErrors && preview.token && (
            <div>
              <Button onClick={handleApply} loading={isApplying} disabled={isApplying}>
                Aplicar importación
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
