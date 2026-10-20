'use client';

import { useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { whatsAppUrl } from '@/lib/whatsapp';
import { isConnectionError, toApiError } from '@/services/http';
import { getReminderShare } from '@/services/invitations';

export const REMINDER_MESSAGES = {
  notCollectable:
    'Este cobro ya no se puede recordar: está pagado, cancelado o es de un exmiembro.',
  connection: 'Sin conexión con el servidor. Revisa tu internet y vuelve a intentarlo.',
  unexpected: 'No pudimos preparar el recordatorio. Inténtalo de nuevo.',
} as const;

/**
 * **Recordar por WhatsApp** en `/cobros/[id]` (spec 005 T028, RF-005-16): pide al servidor el
 * celular verificado del miembro y el texto con monto, período y vencimiento (CA-005-18) y abre
 * `wa.me`. Se pide al tocar para no exponer el celular antes de tiempo; el servidor no envía nada.
 */
export function ReminderWhatsApp({ chargeId }: { chargeId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openReminder() {
    setLoading(true);
    setError(null);
    // La pestaña se abre en el mismo toque para que el navegador no la bloquee.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const share = await getReminderShare(chargeId);
      const url = whatsAppUrl(share.text, share.phone);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch (caught) {
      tab?.close();
      const failure = toApiError(caught);
      setError(
        failure.details?.code === 'CHARGE_NOT_COLLECTABLE'
          ? REMINDER_MESSAGES.notCollectable
          : isConnectionError(failure)
            ? REMINDER_MESSAGES.connection
            : REMINDER_MESSAGES.unexpected,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={openReminder} disabled={loading}>
        {loading ? 'Preparando…' : 'Recordar por WhatsApp'}
      </Button>
      {error && <Alert variant="error">{error}</Alert>}
    </div>
  );
}
