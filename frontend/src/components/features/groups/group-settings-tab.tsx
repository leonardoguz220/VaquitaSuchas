'use client';

import { useState } from 'react';
import { Alert, Card, Switch } from '@/components/ui';
import { useGroupInviteActions } from '@/hooks/use-group-invite-actions';
import type { GroupDetail } from '@/services/groups';
import { invitePanelErrorMessage } from './group-invite-errors';

export interface GroupSettingsTabProps {
  group: GroupDetail;
  /** Recibe el grupo que devuelve la API tras cambiar la recepción. */
  onGroupChange: (group: GroupDetail) => void;
}

type Feedback = { variant: 'success' | 'error'; message: string } | null;

/**
 * Pestaña «Ajustes» del titular (T029). Por ahora solo pausa o reanuda la recepción de miembros
 * con `PATCH /groups/:id { acceptingMembers, version }` (RF-001-09). El formulario de edición del
 * grupo llega con T034. Con el grupo cerrado o congelado queda en solo lectura (CA-001-16).
 */
export function GroupSettingsTab({ group, onGroupChange }: GroupSettingsTabProps) {
  const { setAcceptingMembers, pending } = useGroupInviteActions({ group, onGroupChange });
  const [feedback, setFeedback] = useState<Feedback>(null);
  const accepting = group.entryWindow.acceptingMembers;
  const locked = group.status === 'cerrado' || group.frozenReason !== null;

  async function toggleAccepting() {
    const result = await setAcceptingMembers(!accepting);
    if (!result) return;
    if (result.ok) {
      setFeedback({
        variant: 'success',
        message: accepting
          ? 'Pausaste la recepción de miembros.'
          : 'El grupo vuelve a recibir miembros.',
      });
      return;
    }
    setFeedback({ variant: 'error', message: invitePanelErrorMessage(result.error) });
  }

  return (
    <Card as="section" aria-labelledby="group-settings-title" className="flex flex-col gap-4">
      <h2 id="group-settings-title" className="font-display text-xl font-bold">
        Ajustes del grupo
      </h2>
      <div className="flex flex-col gap-2">
        <Switch
          label="Recibir miembros nuevos"
          checked={accepting}
          onChange={toggleAccepting}
          disabled={locked || pending === 'accepting'}
          onText="Recibiendo"
          offText="En pausa"
        />
        <p className="text-[15px] text-muted">
          Pausar la recepción no cambia a los miembros actuales ni sus cobros.
        </p>
      </div>
      {feedback && (
        <Alert
          variant={feedback.variant}
          title={feedback.message}
          role={feedback.variant === 'success' ? 'status' : 'alert'}
        />
      )}
    </Card>
  );
}
