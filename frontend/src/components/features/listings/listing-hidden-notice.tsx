import { Alert } from '@/components/ui';

/**
 * Aviso para el titular de una publicación oculta por reportes (T023, CA-008-17). La publicación
 * no aparece en la búsqueda hasta que se revise; el titular puede editarla o retirarla.
 */
export function ListingHiddenNotice({ reportCount }: { reportCount: number }) {
  const reports = reportCount === 1 ? '1 reporte' : `${reportCount} reportes`;
  return (
    <Alert variant="warning" title="Tu publicación está oculta">
      <p className="text-[15px]">
        {`Recibió ${reports} de otros usuarios, así que no aparece en la búsqueda. Mientras espera la revisión no puedes renovarla; sí puedes editarla o retirarla.`}
      </p>
    </Alert>
  );
}
