'use client';

import { useState } from 'react';
import { Alert, Button, Card, Modal, Select } from '@/components/ui';
import { useCloseGroup, useTransferOwnership } from '@/hooks/use-group-ownership';
import type { GroupDetail } from '@/services/groups';
import { closeErrorMessage, transferErrorMessage } from './group-settings-errors';

export interface GroupOwnerActionsProps {
  group: GroupDetail;
  /** Recibe el grupo que devuelve la API tras transferir o cerrar. */
  onGroupChange: (group: GroupDetail) => void;
}

/**
 * Acciones del titular que cambian quién administra o si el grupo sigue activo (T037):
 * «Transferir titularidad» (RF-001-17) y «Cerrar grupo» (RF-001-18). Cada una pide confirmación
 * y explica su efecto. Los errores se eligen por `code` y `details.rule`.
 */
export function GroupOwnerActions({ group, onGroupChange }: GroupOwnerActionsProps) {
  const locked = group.status === 'cerrado' || group.frozenReason !== null;
  const candidates = group.members.filter((member) => member.role === 'miembro');
  const transfer = useTransferOwnership();
  const close = useCloseGroup();
  const [toUserId, setToUserId] = useState('');
  const [transferOpen, setTransferOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const target = candidates.find((member) => member.userId === toUserId);

  async function confirmTransfer() {
    if (!target) return;
    const result = await transfer.submit({ groupId: group.id, toUserId: target.userId });
    if (!result) return;
    if (result.ok) {
      setTransferOpen(false);
      onGroupChange(result.data);
      return;
    }
    setTransferError(transferErrorMessage(result.error));
  }

  async function confirmClose() {
    const result = await close.submit(group.id);
    if (!result) return;
    if (result.ok) {
      setCloseOpen(false);
      onGroupChange(result.data);
      return;
    }
    setCloseError(closeErrorMessage(result.error));
  }

  return (
    <>
      <Card as="section" aria-labelledby="owner-transfer-title" className="flex flex-col gap-3">
        <h3 id="owner-transfer-title" className="font-display text-lg font-bold">
          Transferir titularidad
        </h3>
        <p className="text-[15px] text-muted">
          Otro miembro pasa a administrar el grupo y tú sigues como miembro.
        </p>
        {candidates.length === 0 ? (
          <Alert variant="info" title="No hay a quién transferir">
            Necesitas otro miembro activo en el grupo.
          </Alert>
        ) : (
          <Select
            label="Nuevo titular"
            name="toUserId"
            placeholder="Elige a un miembro"
            value={toUserId}
            onChange={(event) => {
              setToUserId(event.target.value);
              setTransferError(null);
            }}
            disabled={locked}
          >
            {candidates.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.fullName}
              </option>
            ))}
          </Select>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            setTransferError(null);
            setTransferOpen(true);
          }}
          disabled={locked || !target}
          className="w-full sm:w-auto sm:self-start"
        >
          Transferir titularidad
        </Button>
      </Card>

      <Card as="section" aria-labelledby="owner-close-title" className="flex flex-col gap-3">
        <h3 id="owner-close-title" className="font-display text-lg font-bold">
          Cerrar grupo
        </h3>
        <p className="text-[15px] text-muted">
          El grupo queda de solo lectura: no genera más cobros ni recibe miembros.
        </p>
        <Button
          variant="danger"
          onClick={() => {
            setCloseError(null);
            setCloseOpen(true);
          }}
          disabled={locked}
          className="w-full sm:w-auto sm:self-start"
        >
          Cerrar grupo
        </Button>
      </Card>

      <Modal
        open={transferOpen}
        onClose={() => !transfer.isSubmitting && setTransferOpen(false)}
        title={`¿Transferir la titularidad a ${target?.fullName ?? ''}?`}
        description="Esta persona administrará el grupo: sus ajustes, su recepción y sus cobros. Tú pasarás a ser miembro y dejarás de administrarlo."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setTransferOpen(false)}
              disabled={transfer.isSubmitting}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={confirmTransfer}
              disabled={transfer.isSubmitting}
              aria-busy={transfer.isSubmitting || undefined}
              className="w-full sm:w-auto"
            >
              Sí, transferir
            </Button>
          </>
        }
      >
        {transferError && <Alert variant="error" title={transferError} role="alert" />}
      </Modal>

      <Modal
        open={closeOpen}
        onClose={() => !close.isSubmitting && setCloseOpen(false)}
        title="¿Cerrar el grupo?"
        description="Queda de solo lectura: no genera más cobros ni recibe miembros. Podrás consultar su historial."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setCloseOpen(false)}
              disabled={close.isSubmitting}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={confirmClose}
              disabled={close.isSubmitting}
              aria-busy={close.isSubmitting || undefined}
              className="w-full sm:w-auto"
            >
              Sí, cerrar grupo
            </Button>
          </>
        }
      >
        {closeError && <Alert variant="error" title={closeError} role="alert" />}
      </Modal>
    </>
  );
}
