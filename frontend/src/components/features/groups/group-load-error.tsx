'use client';

import { Alert, Button } from '@/components/ui';
import { isConnectionError, type ApiError } from '@/services/http';

export interface GroupLoadErrorProps {
  error: ApiError;
  /** Qué no se pudo cargar, por ejemplo «tus suscripciones». */
  what: string;
  onRetry: () => void;
}

/** Error al cargar datos de grupos, distinguiendo la falta de conexión, con «Reintentar». */
export function GroupLoadError({ error, what, onRetry }: GroupLoadErrorProps) {
  const offline = isConnectionError(error);
  return (
    <Alert
      variant="error"
      title={offline ? 'Sin conexión con el servidor.' : `No pudimos cargar ${what}.`}
      action={
        <Button variant="secondary" onClick={onRetry} className="w-full sm:w-auto">
          Reintentar
        </Button>
      }
    >
      {offline
        ? 'Revisa tu conexión a internet y vuelve a intentarlo.'
        : 'Vuelve a intentarlo en unos segundos.'}
    </Alert>
  );
}
