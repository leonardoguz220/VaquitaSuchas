'use client';

import { useId, useRef, useState, type ChangeEvent } from 'react';
import { Alert, Button, Card } from '@/components/ui';
import { useCatalogImportApply, useCatalogImportPreview } from '@/hooks/use-admin-catalog';
import type { CatalogImportChange, CatalogImportPreview } from '@/services/admin-catalog';
import { isConnectionError, type ApiError } from '@/services/http';
import { ADMIN_MESSAGES } from './admin-messages';

const ACTION_LABEL: Record<CatalogImportChange['action'], string> = {
  crear: 'se crea',
  actualizar: 'se actualiza',
  sin_cambios: 'sin cambios',
};

const ENTITY_LABEL: Record<CatalogImportChange['entity'], string> = {
  servicio: 'Servicio',
  plan: 'Plan',
};

function importErrorMessage(error: ApiError): string {
  if (error.statusCode === 403) return ADMIN_MESSAGES.forbidden;
  if (error.statusCode === 413) return 'El archivo es demasiado grande.';
  if (error.statusCode === 415 || error.code === 'VALIDATION_ERROR')
    return 'El archivo debe ser CSV o JSON con el formato del catálogo.';
  if (error.statusCode === 404 || error.statusCode === 409 || error.statusCode === 410)
    return 'La vista previa venció o ya se usó. Vuelve a cargar el archivo.';
  return isConnectionError(error) ? ADMIN_MESSAGES.connection : ADMIN_MESSAGES.unexpected;
}

/**
 * Importación del catálogo desde un archivo CSV o JSON (RF-009-06): primero una **vista previa**
 * que no cambia nada, con los cambios y los errores por fila; luego **Aplicar** con el token, que
 * aplica todo o nada (CA-009-06). Con errores no se puede aplicar.
 */
export function CatalogImport({ onApplied }: { onApplied: () => void }) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = useCatalogImportPreview();
  const apply = useCatalogImportApply();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<CatalogImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setResult(null);
    setError(null);
    setApplied(false);
  }

  async function handlePreview() {
    if (!file) {
      setError('Elige un archivo CSV o JSON.');
      return;
    }
    setError(null);
    const response = await preview.submit(file);
    if (!response) return;
    if (response.ok) setResult(response.data);
    else setError(importErrorMessage(response.error));
  }

  async function handleApply() {
    if (!result) return;
    setError(null);
    const response = await apply.submit(result.token);
    if (!response) return;
    if (response.ok) {
      setApplied(true);
      setResult(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onApplied();
    } else {
      setError(importErrorMessage(response.error));
      if (response.error.statusCode !== 0) setResult(null);
    }
  }

  const changes = result?.changes.filter((change) => change.action !== 'sin_cambios') ?? [];

  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <h2 id={titleId} className="font-display text-xl font-bold">
        Importar catálogo
      </h2>
      <p className="text-muted">
        Carga un archivo CSV o JSON. Primero verás los cambios y los errores por fila; nada se
        aplica hasta que confirmes, y si una fila es inválida no se aplica ninguna.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${titleId}-file`} className="font-bold">
          Archivo del catálogo
        </label>
        <input
          ref={inputRef}
          id={`${titleId}-file`}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={handleFile}
          className="min-h-11 text-[15px] file:mr-3 file:min-h-11 file:rounded-field file:border-[1.5px] file:border-primary file:bg-surface file:px-4 file:font-bold file:text-primary"
        />
      </div>
      <Button
        variant="secondary"
        onClick={() => void handlePreview()}
        loading={preview.isSubmitting}
        className="w-full sm:w-auto sm:self-start"
      >
        Ver vista previa
      </Button>

      {error && <Alert variant="error">{error}</Alert>}
      {applied && (
        <Alert variant="success">
          Importación aplicada. Las suscripciones existentes no cambian.
        </Alert>
      )}

      {result && (
        <div className="flex flex-col gap-3">
          {result.errors.length > 0 ? (
            <Alert variant="error" title={`Hay ${result.errors.length} filas con errores.`}>
              Corrige el archivo y vuelve a cargarlo. No se aplicó ningún cambio.
            </Alert>
          ) : (
            <Alert variant="success">
              Todas las filas son válidas: {changes.length}{' '}
              {changes.length === 1 ? 'cambio' : 'cambios'} por aplicar.
            </Alert>
          )}
          {result.errors.length > 0 && (
            <ul aria-label="Errores por fila" className="flex flex-col gap-1">
              {result.errors.map((item, index) => (
                <li key={`${item.row}-${item.field}-${index}`} className="break-words">
                  <span className="font-bold">Fila {item.row}</span> ({item.field}): {item.message}
                </li>
              ))}
            </ul>
          )}
          {changes.length > 0 && (
            <ul aria-label="Cambios de la vista previa" className="flex flex-col gap-1">
              {changes.map((change, index) => (
                <li key={`${change.row}-${change.slug}-${index}`} className="break-words">
                  Fila {change.row}: {ENTITY_LABEL[change.entity]} {change.name ?? change.slug} (
                  {change.slug}) {ACTION_LABEL[change.action]}
                </li>
              ))}
            </ul>
          )}
          <Button
            onClick={() => void handleApply()}
            loading={apply.isSubmitting}
            disabled={result.errors.length > 0 || changes.length === 0}
            className="w-full sm:w-auto sm:self-start"
          >
            Aplicar cambios
          </Button>
        </div>
      )}
    </Card>
  );
}
