'use client';

import { useId, useRef, useState } from 'react';
import { Alert, Button, Modal } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { useRegenerateInviteCode, useUpdateGroup } from '@/hooks/use-groups';
import { isConnectionError } from '@/services/http';
import type { GroupDetail } from '@/services/groups';
import { GROUP_MESSAGES, ownerActionErrorMessage } from './group-messages';
import { InviteCodeCard } from './invite-code-card';

interface Notice {
  variant: 'success' | 'error';
  message: string;
}

export interface OwnerInviteSectionProps {
  group: GroupDetail;
  /** El grupo que devolvió la API tras un cambio. */
  onGroupChange: (group: GroupDetail) => void;
  /** Vuelve a pedir el grupo sin perder el aviso (tras `409 STALE_STATE`). */
  onRefresh: () => Promise<void>;
}

/**
 * Código de invitación del titular en `/grupos/[id]` (spec 001 T025, plan §6; mockups
 * `Grupo.dc.html` y `GrupoAjustes.dc.html`): **Copiar** y **Compartir**, **Regenerar código**
 * con un modal que explica el efecto (RF-001-08) y el interruptor para recibir o pausar nuevos
 * miembros (RF-001-09). No se muestra si el grupo está cerrado o congelado (solo lectura).
 */
export function OwnerInviteSection({ group, onGroupChange, onRefresh }: OwnerInviteSectionProps) {
  const switchLabelId = useId();
  const switchHintId = useId();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const regenerate = useRegenerateInviteCode(group.id);
  const update = useUpdateGroup(group.id);
  const accepting = group.entryWindow.acceptingMembers;

  if (!group.inviteCode || group.status !== 'activo' || group.frozenReason) return null;

  function openConfirm() {
    setModalError(null);
    setConfirmOpen(true);
  }

  async function handleRegenerate() {
    setModalError(null);
    const result = await regenerate.submit();
    if (!result) return;
    if (result.ok) {
      onGroupChange({ ...group, inviteCode: result.data.inviteCode });
      setConfirmOpen(false);
      setNotice({ variant: 'success', message: GROUP_MESSAGES.regenerated });
      return;
    }
    if (result.error.code === 'STALE_STATE' || result.error.code === 'GROUP_CLOSED') {
      setConfirmOpen(false);
      setNotice({ variant: 'error', message: ownerActionErrorMessage(result.error) });
      await onRefresh();
      return;
    }
    setModalError(ownerActionErrorMessage(result.error));
  }

  async function handleToggle() {
    setNotice(null);
    const next = !accepting;
    const result = await update.submit({ acceptingMembers: next, version: group.version });
    if (!result) return;
    if (result.ok) {
      onGroupChange(result.data);
      setNotice({
        variant: 'success',
        message: next ? GROUP_MESSAGES.acceptingOn : GROUP_MESSAGES.acceptingOff,
      });
      return;
    }
    const message = isConnectionError(result.error)
      ? `${GROUP_MESSAGES.acceptingFailed} ${GROUP_MESSAGES.connection}`
      : ownerActionErrorMessage(result.error);
    setNotice({ variant: 'error', message });
    if (result.error.code === 'STALE_STATE') await onRefresh();
  }

  return (
    <InviteCodeCard code={group.inviteCode} groupName={group.name}>
      <div className="flex flex-col gap-4 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col">
            <span id={switchLabelId} className="font-bold">
              Recibir solicitudes con el código
            </span>
            <span id={switchHintId} className="text-[15px] text-muted">
              {accepting
                ? 'Quien tenga el código puede pedir entrar durante la ventana de ingreso.'
                : 'Nadie puede pedir entrar hasta que lo vuelvas a activar.'}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={accepting}
            aria-labelledby={switchLabelId}
            aria-describedby={switchHintId}
            disabled={update.isSubmitting}
            onClick={() => void handleToggle()}
            className={cx(
              'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border-[1.5px] py-1 pr-3 pl-1 font-bold',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60',
              accepting
                ? 'border-primary bg-primary text-white'
                : 'border-field-border bg-surface text-ink',
            )}
          >
            <span
              aria-hidden="true"
              className={cx(
                'size-8 rounded-full transition-transform motion-reduce:transition-none',
                accepting ? 'order-2 bg-white' : 'bg-field-border',
              )}
            />
            <span aria-hidden="true">{accepting ? 'Sí' : 'No'}</span>
          </button>
        </div>

        <Button
          variant="secondary"
          onClick={openConfirm}
          className="w-full sm:w-auto sm:self-start"
        >
          Regenerar código
        </Button>
        <p className="text-[15px] text-muted">
          Pausar o regenerar no afecta a las solicitudes que ya están abiertas.
        </p>

        {notice && <Alert variant={notice.variant}>{notice.message}</Alert>}
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="¿Regenerar el código?"
        description={`El código ${group.inviteCode} dejará de funcionar al instante. Quien todavía no lo usó necesitará el nuevo.`}
        initialFocusRef={cancelRef}
        footer={
          <>
            <Button
              ref={cancelRef}
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={regenerate.isSubmitting}
            >
              Cancelar
            </Button>
            <Button onClick={() => void handleRegenerate()} loading={regenerate.isSubmitting}>
              Regenerar código
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-muted">
          Las solicitudes de ingreso que ya están abiertas siguen igual.
        </p>
        {modalError && (
          <Alert variant="error" title={GROUP_MESSAGES.regenerateFailed}>
            {modalError}
          </Alert>
        )}
      </Modal>
    </InviteCodeCard>
  );
}
