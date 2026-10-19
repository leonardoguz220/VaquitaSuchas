'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Card, Modal } from '@/components/ui';
import { useRemoveMember } from '@/hooks/use-remove-member';
import { formatDateLaPaz } from '@/lib/dates';
import { formatPhone } from '@/lib/phone';
import type { GroupDetail, GroupMember } from '@/services/groups';
import { ROLE_BADGE, ROLE_LABEL } from './group-labels';
import { removeMemberErrorMessage } from './group-members-errors';

export interface GroupMembersTabProps {
  group: GroupDetail;
  /** Recibe el grupo recargado tras quitar a alguien. */
  onGroupChange: (group: GroupDetail) => void;
}

type Feedback = { variant: 'success' | 'error'; message: string } | null;

function openChargesText(count: number): string {
  if (count === 0) return '';
  const noun = count === 1 ? 'cobro sin pagar' : 'cobros sin pagar';
  return ` Conserva ${count} ${noun}; puedes cancelarlos desde Cobros.`;
}

/**
 * Pestaña «Miembros» del detalle (RF-001-19; mockup `GrupoMiembros.dc.html`): nombre, rol,
 * celular solo si la API lo entrega y fecha de ingreso. El titular puede quitar a un miembro con
 * confirmación (RF-001-15): sus cobros se conservan y se avisa cuántos siguen sin pagar.
 */
export function GroupMembersTab({ group, onGroupChange }: GroupMembersTabProps) {
  const { members } = group;
  const isOwner = group.myRole === 'titular';
  const locked = group.status === 'cerrado' || group.frozenReason !== null;
  const { remove, pending } = useRemoveMember(group, onGroupChange);
  const [target, setTarget] = useState<GroupMember | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function confirmRemove() {
    if (!target) return;
    const result = await remove(target.userId);
    if (!result) return;
    setTarget(null);
    if (result.ok) {
      setFeedback({
        variant: 'success',
        message: `Quitaste a ${target.fullName} del grupo.${openChargesText(result.openCharges)}`,
      });
    } else {
      setFeedback({ variant: 'error', message: removeMemberErrorMessage(result.error) });
    }
  }

  return (
    <Card as="section" aria-labelledby="group-members-title" className="flex flex-col gap-2">
      <h2 id="group-members-title" className="font-display text-xl font-bold">
        Miembros ({members.length})
      </h2>
      <ul aria-label="Miembros del grupo" className="flex flex-col divide-y divide-line">
        {members.map((member) => (
          <li key={member.userId} className="flex flex-col gap-1 py-3">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-bold break-words">{member.fullName}</span>
              <Badge variant={ROLE_BADGE[member.role]}>{ROLE_LABEL[member.role]}</Badge>
            </span>
            {member.phone && (
              <span className="text-[15px]">
                Celular: <span className="font-bold">{formatPhone(member.phone)}</span>
              </span>
            )}
            <span className="text-[15px] text-muted">
              Desde el {formatDateLaPaz(member.joinedAt)}
            </span>
            {isOwner && !locked && member.role === 'miembro' && (
              <Button
                variant="danger"
                onClick={() => setTarget(member)}
                disabled={pending}
                aria-label={`Quitar a ${member.fullName}`}
                className="w-full sm:w-auto sm:self-start"
              >
                Quitar
              </Button>
            )}
          </li>
        ))}
      </ul>

      {feedback && (
        <Alert
          variant={feedback.variant}
          title={feedback.message}
          role={feedback.variant === 'success' ? 'status' : 'alert'}
        />
      )}

      <Modal
        open={target !== null}
        onClose={() => !pending && setTarget(null)}
        title={`¿Quitar a ${target?.fullName ?? ''} del grupo?`}
        description="Se conservarán sus cobros. Si tiene cobros sin pagar, siguen vigentes hasta que los canceles desde Cobros."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setTarget(null)}
              disabled={pending}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={confirmRemove}
              disabled={pending}
              aria-busy={pending || undefined}
              className="w-full sm:w-auto"
            >
              Quitar del grupo
            </Button>
          </>
        }
      >
        <p className="text-muted">La persona deja de ver este grupo y sus cuotas se recalculan.</p>
      </Modal>
    </Card>
  );
}
