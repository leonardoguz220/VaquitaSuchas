/** Correo que el sistema envía a una sola persona (RF-000-12). */
export interface MailMessage {
  /** Dirección de destino, sin nombre: `persona@ejemplo.com`. */
  readonly to: string;
  readonly subject: string;
  /** Cuerpo en HTML. */
  readonly html: string;
  /** Cuerpo en texto plano, para clientes que no muestran HTML. */
  readonly text: string;
}

/**
 * Puerto de envío de correo. Los servicios de negocio dependen solo de esta clase; el módulo
 * `MailModule` decide por `MAIL_MODE` si el correo va a la bandeja local (`dev`) o al
 * proveedor por API HTTPS (`prod`). Es una clase abstracta para que sirva de token de inyección.
 *
 * Contrato: resuelve cuando el servidor o proveedor aceptó el mensaje; si no pudo entregarlo
 * lanza `MailDeliveryError`; si el mensaje es inválido lanza `InvalidMailMessageError` sin
 * intentar ningún envío. Ningún error incluye la dirección, el contenido ni las credenciales.
 */
export abstract class MailService {
  abstract send(message: MailMessage): Promise<void>;
}

/** El mensaje no cumple el contrato (dirección inválida, asunto vacío, cuerpo ausente...). */
export class InvalidMailMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMailMessageError';
  }
}

/** El servidor SMTP o el proveedor no aceptó el mensaje, o no se pudo hablar con él. */
export class MailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailDeliveryError';
  }
}
