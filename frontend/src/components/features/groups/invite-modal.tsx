'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Field, Modal } from '@/components/ui';
import { useApiSubmit } from '@/hooks/use-api-submit';
import { copyText } from '@/lib/clipboard';
import { whatsAppUrl } from '@/lib/whatsapp';
import { isConnectionError, toApiError, type ApiError } from '@/services/http';
import { getInvitationShare, sendInvitation, type InvitationShare } from '@/services/invitations';

export const INVITE_MESSAGES = {
  limit: 'Puedes enviar hasta 10 invitaciones por correo por hora.',
  invalidEmail: 'Escribe un correo válido, por ejemplo ana@correo.com.',
  closed: 'El grupo está cerrado: ya no se puede invitar.',
  frozen: 'El grupo está en solo lectura porque el titular fue baneado.',
  connection: 'Sin conexión con el servidor. Revisa tu internet y vuelve a intentarlo.',
  unexpected: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
  shareFailed: 'No pudimos preparar el enlace de invitación.',
  copied: 'Enlace copiado.',
  copyFailed: 'No pudimos copiar el enlace. Cópialo a mano.',
} as const;

/** Mensaje de cada error del contrato 005 por `code`, nunca por `message`. */
export function inviteErrorMessage(error: ApiError): string {
  if (error.code === 'VALIDATION_ERROR') return INVITE_MESSAGES.invalidEmail;
  if (error.code === 'RATE_LIMITED') {
    const seconds = error.details?.retryAfterSeconds;
    const minutes = typeof seconds === 'number' ? Math.max(1, Math.ceil(seconds / 60)) : null;
    return minutes
      ? `Llegaste al límite de 10 invitaciones por hora. Prueba de nuevo en ${minutes} min.`
      : 'Llegaste al límite de 10 invitaciones por hora. Prueba de nuevo más tarde.';
  }
  if (error.code === 'GROUP_CLOSED') return INVITE_MESSAGES.closed;
  if (error.code === 'GROUP_FROZEN') return INVITE_MESSAGES.frozen;
  return isConnectionError(error) ? INVITE_MESSAGES.connection : INVITE_MESSAGES.unexpected;
}

type ShareState =
  | { status: 'loading' }
  | { status: 'ready'; share: InvitationShare }
  | { status: 'error'; message: string };

export interface InviteModalProps {
  groupId: string;
  groupName: string;
  open: boolean;
  onClose: () => void;
}

/**
 * **Invitar** en `/grupos/[id]` (spec 005 T028, plan §6): correo (RF-005-14) con el aviso del
 * límite, botón **WhatsApp** que abre `wa.me` con el texto que arma el servidor (RF-005-15,
 * CA-005-17) y **Copiar enlace**. La respuesta del envío no dice si el correo ya es miembro.
 */
export function InviteModal({ groupId, groupName, open, onClose }: InviteModalProps) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [share, setShare] = useState<ShareState>({ status: 'loading' });
  const [copied, setCopied] = useState<boolean | null>(null);
  const request = useCallback((value: string) => sendInvitation(groupId, value), [groupId]);
  const { submit, isSubmitting } = useApiSubmit(request);

  const loadShare = useCallback(async () => {
    setShare({ status: 'loading' });
    try {
      setShare({ status: 'ready', share: await getInvitationShare(groupId) });
    } catch (caught) {
      const failure = toApiError(caught);
      setShare({
        status: 'error',
        message:
          failure.code === 'GROUP_CLOSED' || failure.code === 'GROUP_FROZEN'
            ? inviteErrorMessage(failure)
            : INVITE_MESSAGES.shareFailed,
      });
    }
  }, [groupId]);

  useEffect(() => {
    // Pide el enlace al abrir; los cambios de estado llegan cuando responde la API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) void loadShare();
  }, [open, loadShare]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSentTo(null);
    setError(null);
    const value = email.trim();
    const result = await submit(value);
    if (!result) return;
    if (result.ok) {
      setSentTo(value);
      setEmail('');
    } else {
      setError(result.error);
    }
  }

  async function copyLink(url: string) {
    setCopied(await copyText(url));
  }

  const fieldError = error?.code === 'VALIDATION_ERROR' ? INVITE_MESSAGES.invalidEmail : undefined;

  return (
    <Modal open={open} onClose={onClose} title={`Invitar a ${groupName}`}>
      <div className="flex flex-col gap-5">
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Field
            label="Correo de la persona"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            hint={INVITE_MESSAGES.limit}
            error={fieldError}
            required
          />
          <Button type="submit" disabled={isSubmitting || email.trim() === ''}>
            {isSubmitting ? 'Enviando…' : 'Enviar invitación'}
          </Button>
          {sentTo && (
            <Alert variant="success">
              Enviamos la invitación a {sentTo}. Le llegará un correo con el enlace y el código.
            </Alert>
          )}
          {error && !fieldError && <Alert variant="error">{inviteErrorMessage(error)}</Alert>}
        </form>

        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <h3 className="font-bold">O comparte el enlace</h3>
          {share.status === 'loading' && (
            <p role="status" className="text-muted">
              Preparando el enlace…
            </p>
          )}
          {share.status === 'error' && (
            <Alert variant="error">
              {share.message}{' '}
              <button type="button" className="font-bold underline" onClick={loadShare}>
                Reintentar
              </button>
            </Alert>
          )}
          {share.status === 'ready' && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                href={whatsAppUrl(share.share.text)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Invitar por WhatsApp
              </Button>
              <Button variant="secondary" onClick={() => copyLink(share.share.inviteUrl)}>
                Copiar enlace
              </Button>
            </div>
          )}
          {copied !== null && (
            <p role="status" className={copied ? 'text-primary' : 'text-danger'}>
              {copied ? INVITE_MESSAGES.copied : INVITE_MESSAGES.copyFailed}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
