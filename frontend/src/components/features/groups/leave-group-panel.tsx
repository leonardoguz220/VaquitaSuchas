'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, Modal } from '@/components/ui';
import { useLeaveGroup } from '@/hooks/use-leave-group';
import type { GroupDetail } from '@/services/groups';
import { leaveErrorMessage } from './group-members-errors';

const GROUPS_PATH = '/grupos';

export interface LeaveGroupPanelProps {
  group: GroupDetail;
}

/**
 * Botón «Abandonar grupo» del miembro (T031, RF-001-16). Pide confirmación. Si tiene cobros
 * `pendiente`, `en_revision` o `atrasado`, la API lo impide y el modal dice cuántos son (CA-001-14).
 * Al salir bien vuelve a «Mis suscripciones».
 */
export function LeaveGroupPanel({ group }: LeaveGroupPanelProps) {
  const router = useRouter();
  const { submit, isSubmitting } = useLeaveGroup();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openModal() {
    setError(null);
    setOpen(true);
  }

  async function confirmLeave() {
    const result = await submit(group.id);
    if (!result) return;
    if (result.ok) {
      router.push(GROUPS_PATH);
      return;
    }
    setError(leaveErrorMessage(result.error));
  }

  return (
    <Card as="section" aria-labelledby="leave-group-title" className="flex flex-col gap-3">
      <h2 id="leave-group-title" className="font-display text-xl font-bold">
        Dejar el grupo
      </h2>
      <p className="text-muted">
        Si tienes cobros sin pagar, primero debes saldarlos o pedir al titular que los cancele.
      </p>
      <Button variant="danger" onClick={openModal} className="w-full sm:w-auto sm:self-start">
        Abandonar grupo
      </Button>

      <Modal
        open={open}
        onClose={() => !isSubmitting && setOpen(false)}
        title={`¿Abandonar «${group.name}»?`}
        description="Dejarás de ver este grupo y sus cuotas."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={confirmLeave}
              disabled={isSubmitting}
              aria-busy={isSubmitting || undefined}
              className="w-full sm:w-auto"
            >
              Sí, abandonar
            </Button>
          </>
        }
      >
        {error && <Alert variant="error" title={error} role="alert" />}
      </Modal>
    </Card>
  );
}
