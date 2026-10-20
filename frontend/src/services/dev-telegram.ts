/**
 * Cliente de las rutas de desarrollo del bot (contrato 000 B, "Solo en TELEGRAM_MODE=dev").
 * Solo las usa la pantalla `/dev/telegram`; en otro modo el backend responde 404.
 */
import { apiRequest } from './http';

/** Cuerpo de `POST /dev/telegram/simulate`. */
export interface TelegramSimulateRequest {
  kind: 'start' | 'contact';
  telegramUserId: number;
  token?: string;
  phoneNumber?: string;
  contactUserId?: number;
}

/**
 * `POST /dev/telegram/simulate`: el backend arma un `Update` como el de Telegram y lo procesa
 * como si llegara por el webhook. El contrato no fija la respuesta, por eso es `unknown`.
 */
export function simulateTelegram(body: TelegramSimulateRequest): Promise<unknown> {
  return apiRequest<unknown>('/api/dev/telegram/simulate', { method: 'POST', body });
}

/**
 * `GET /dev/telegram/outbox?telegramUserId=`: mensajes que el bot "envió" a esa cuenta.
 * El contrato solo dice "texto y botones", así que se tipa como `unknown` y la pantalla lo
 * muestra tal cual. Se tipará cuando backend fije la forma (spec 000, T030 [BE]).
 */
export function getTelegramOutbox(telegramUserId: number): Promise<unknown> {
  const query = new URLSearchParams({ telegramUserId: String(telegramUserId) });
  return apiRequest<unknown>(`/api/dev/telegram/outbox?${query.toString()}`);
}
