import { QRCodeSVG } from 'qrcode.react';
import { cx } from '@/components/ui/cx';

export const TELEGRAM_QR_LABEL = 'Código QR del enlace al bot de Telegram';

export interface TelegramQrProps {
  telegramUrl: string;
  className?: string;
}

/**
 * Código QR del enlace al bot para quien está en la computadora (RF-003-21). Su alternativa en
 * texto es el enlace visible de `TelegramVerifyCard` y el botón "Abrir Telegram".
 */
export function TelegramQr({ telegramUrl, className }: TelegramQrProps) {
  return (
    <figure className={cx('m-0 flex-col items-center gap-3', className)}>
      <div className="rounded-field border border-line bg-surface p-3">
        <QRCodeSVG
          value={telegramUrl}
          size={168}
          level="M"
          marginSize={1}
          fgColor="#17201c"
          bgColor="#ffffff"
          role="img"
          aria-label={TELEGRAM_QR_LABEL}
          title={TELEGRAM_QR_LABEL}
        />
      </div>
      <figcaption className="max-w-48 text-center text-[15px] text-muted">
        ¿Estás en la computadora? Escanéalo con la cámara de tu celular.
      </figcaption>
    </figure>
  );
}
