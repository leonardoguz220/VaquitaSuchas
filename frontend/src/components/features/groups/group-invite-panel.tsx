'use client';

import { useId, useState } from 'react';
import { Alert, Button, Card, Modal, type AlertVariant } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { useGroupInviteActions, type InviteActionResult } from '@/hooks/use-group-invite-actions';
import type { GroupDetail } from '@/services/groups';
import { INVITE_PANEL_MESSAGES, invitePanelErrorMessage } from './group-invite-errors';
import { InviteCodeShare } from './invite-code-share';
import { InviteModal } from './invite-modal';

export const REGENERATE_EFFECT =
  'El código anterior dejará de funcionar de inmediato; quien lo tenga ya no podrá usarlo.';

type Feedback = { variant: AlertVariant; message: string } | null;

function feedbackOf(result: InviteActionResult, success: string): Feedback {
  if (!result) return null;
  if (result.ok) return { variant: 'success', message: success };
  return {
    variant: result.stale ? 'warning' : 'error',
    message: invitePanelErrorMessage(result.error),
  };
}

function readOnlyReason(group: GroupDetail): string | null {
  if (group.status === 'cerrado') return INVITE_PANEL_MESSAGES.closed;
  if (group.frozenReason !== null) return INVITE_PANEL_MESSAGES.frozen;
  return null;
}

export interface GroupInvitePanelProps {
  group: GroupDetail;
  onGroupChange: (group: GroupDetail) => void;
}

/**
 * Panel del titular en `/grupos/[id]` (T025; mockups `Grupo.dc.html` y `GrupoAjustes.dc.html`):
 * código de invitación con Copiar y Compartir (RF-001-06), **Invitar** por correo o WhatsApp
 * (spec 005 T028), «Regenerar código» con confirmación
 * (RF-001-08) y el interruptor para recibir miembros (RF-001-09). Con el grupo cerrado o
 * congelado todo queda en solo lectura (CA-001-16).
 */
export function GroupInvitePanel({ group, onGroupChange }: GroupInvitePanelProps) {
  const { regenerate, setAcceptingMembers, pending } = useGroupInviteActions({
    group,
    onGroupChange,
  });
  const [confirming, setConfirming] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const titleId = useId();
  const switchLabelId = useId();
  const switchStateId = useId();

  const lockedReason = readOnlyReason(group);
  const locked = lockedReason !== null;
  const accepting = group.entryWindow.acceptingMembers;
  const code = group.inviteCode;

  async function confirmRegenerate() {
    const result = await regenerate();
    if (!result) return;
    setConfirming(false);
    setFeedback(feedbackOf(result, 'Código regenerado. El anterior ya no funciona.'));
  }

  async function toggleAccepting() {
    const result = await setAcceptingMembers(!accepting);
    setFeedback(
      feedbackOf(
        result,
        accepting ? 'Pausaste la recepción de miembros.' : 'El grupo vuelve a recibir miembros.',
      ),
    );
  }

  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="font-display text-xl font-bold">
          Invitar al grupo
        </h2>
        <p className="text-muted">
          Comparte este código con quienes quieras invitar. Solo tú lo ves.
        </p>
      </div>

      {lockedReason && <Alert variant="info" title={lockedReason} />}

      {code ? (
        <InviteCodeShare key={code} code={code} groupName={group.name} />
      ) : (
        <p className="text-muted">No pudimos mostrar el código de invitación.</p>
      )}

      <Button
        onClick={() => setInviting(true)}
        disabled={locked}
        className="w-full sm:w-auto sm:self-start"
      >
        Invitar por correo o WhatsApp
      </Button>
      <InviteModal
        groupId={group.id}
        groupName={group.name}
        open={inviting}
        onClose={() => setInviting(false)}
      />

      <Button
        variant="secondary"
        onClick={() => setConfirming(true)}
        disabled={locked || pending !== null}
        className="w-full sm:w-auto sm:self-start"
      >
        Regenerar código
      </Button>

      <div className="flex flex-col gap-1 border-t border-line pt-4">
        <button
          type="button"
          role="switch"
          aria-checked={accepting}
          aria-labelledby={switchLabelId}
          aria-describedby={switchStateId}
          aria-busy={pending === 'accepting' || undefined}
          disabled={locked || pending !== null}
          onClick={toggleAccepting}
          className="flex min-h-11 w-full items-center justify-between gap-4 rounded-field py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span id={switchLabelId} className="font-bold">
            Recibir solicitudes con el código
          </span>
          <span
            aria-hidden="true"
            className={cx(
              'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-[1.5px] transition-colors motion-reduce:transition-none',
              accepting ? 'border-primary bg-primary' : 'border-muted bg-surface',
            )}
          >
            <span
              className={cx(
                'size-5 rounded-full transition-transform motion-reduce:transition-none',
                accepting ? 'translate-x-[22px] bg-surface' : 'translate-x-[3px] bg-muted',
              )}
            />
          </span>
        </button>
        <p id={switchStateId} className="text-[15px] text-muted">
          {pending === 'accepting'
            ? 'Guardando…'
            : accepting
              ? 'Activado: quien tenga el código puede pedir entrar durante la ventana de ingreso.'
              : 'Pausado: nadie puede pedir entrar con el código.'}
        </p>
      </div>

      {feedback && (
        <Alert
          variant={feedback.variant}
          title={feedback.message}
          role={feedback.variant === 'success' ? 'status' : 'alert'}
        />
      )}

      <Modal
        open={confirming}
        onClose={() => pending === null && setConfirming(false)}
        title="¿Regenerar el código?"
        description={REGENERATE_EFFECT}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirming(false)}
              disabled={pending !== null}
            >
              Cancelar
            </Button>
            <Button onClick={confirmRegenerate} loading={pending === 'regenerate'}>
              Regenerar código
            </Button>
          </>
        }
      />
    </Card>
  );
}
