// Lectura de la bandeja local (Mailpit) en las e2e que envían correo. Requiere Mailpit
// (`npm run db:up`; en CI es el servicio `mail` del job test-backend).
const MAILPIT_URL = (process.env.MAILPIT_URL || 'http://localhost:8025').replace(/\/$/, '');

export interface MailpitMessage {
  ID: string;
  Subject: string;
  Text: string;
  HTML: string;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}${path}`);
  if (!response.ok) throw new Error(`Mailpit respondió ${response.status} en ${path}`);
  return (await response.json()) as T;
}

/** Espera hasta tener `count` correos para `to` (la entrega por SMTP es asíncrona); del más viejo al más nuevo. */
export async function waitForMessagesTo(to: string, count = 1): Promise<MailpitMessage[]> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const { messages } = await getJson<{ messages: { ID: string }[] }>(
      `/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
    );
    if (messages.length >= count) {
      const full = await Promise.all(
        messages.map((m) => getJson<MailpitMessage>(`/api/v1/message/${m.ID}`)),
      );
      return full.reverse();
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return [];
}

/** Token del enlace `/recuperar/<token>` de un correo de recuperación. */
export function resetTokenOf(message: MailpitMessage): string {
  return /\/recuperar\/([A-Za-z0-9_-]+)/.exec(message.Text)?.[1] ?? '';
}
