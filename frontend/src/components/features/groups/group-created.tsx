'use client';

import { Alert, Button } from '@/components/ui';
import type { GroupDetail } from '@/services/groups';
import type { ApiError } from '@/services/http';
import { InviteCodeShare } from './invite-code-share';
import { qrUploadErrorMessage } from './new-group-errors';

export interface GroupCreatedProps {
  group: GroupDetail;
  qrError: ApiError | null;
}

/** Resultado de crear (RF-001-04): el código de invitación con **Copiar** y **Compartir**. */
export function GroupCreated({ group, qrError }: GroupCreatedProps) {
  const code = group.inviteCode ?? '';

  return (
    <section
      aria-labelledby="grupo-creado"
      className="flex flex-col gap-5 rounded-card border border-line bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="grupo-creado" className="font-display text-2xl font-bold">
          ¡Listo! Creaste «{group.name}»
        </h2>
        <p className="text-muted">
          Comparte este código con quienes quieras invitar a tu suscripción.
        </p>
      </div>
      <InviteCodeShare code={code} groupName={group.name} />
      {qrError && (
        <Alert variant="warning" title={qrUploadErrorMessage(qrError)}>
          Tu grupo ya está creado. Puedes subir el QR desde la configuración del grupo.
        </Alert>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button href={`/grupos/${group.id}`} className="w-full sm:w-auto">
          Ver el grupo
        </Button>
        <Button variant="secondary" href="/grupos" className="w-full sm:w-auto">
          Ir a Mis suscripciones
        </Button>
      </div>
    </section>
  );
}
