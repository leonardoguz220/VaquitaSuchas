'use client';

import { useState } from 'react';
import { cx } from '@/components/ui/cx';
import { isHexColor, readableTextColor } from '@/lib/color-contrast';

/** Fondo de la inicial cuando el servicio no tiene `brandColor`: token `muted` (blanco 7.18:1). */
export const NEUTRAL_LOGO_BACKGROUND = '#4f5a55';

export type ServiceLogoSize = 'sm' | 'md';

// Clases completas para que Tailwind las detecte. md = 44 px (mockup), sm = 32 px (resúmenes).
const sizes: Record<ServiceLogoSize, string> = {
  sm: 'size-8 rounded-lg text-base',
  md: 'size-11 rounded-field text-xl',
};

/** Primera letra visible del nombre, en mayúscula y conservando la tilde (`ánime` → `Á`). */
export function serviceInitial(name: string): string {
  const [first] = Array.from(name.trim());
  return first ? first.toLocaleUpperCase('es-BO') : '?';
}

export interface ServiceLogoProps {
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
  /**
   * `true` (por defecto) cuando el nombre se muestra al lado: el logo no se anuncia.
   * `false` cuando el logo va solo: la imagen o la inicial llevan el nombre del servicio.
   */
  decorative?: boolean;
  size?: ServiceLogoSize;
  className?: string;
}

/**
 * Logo de un servicio del catálogo (plan 004 §6, CA-004-12). Carga la URL pública del seed sin
 * enviar el referer; si falla o no hay URL, muestra la inicial sobre el color de marca con el
 * color de texto que asegura 4.5:1.
 */
export function ServiceLogo({
  name,
  logoUrl,
  brandColor,
  decorative = true,
  size = 'md',
  className,
}: ServiceLogoProps) {
  // Se guarda la URL que falló, no un booleano: si llega otra URL se vuelve a intentar.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const box = cx('inline-flex shrink-0 items-center justify-center overflow-hidden', sizes[size]);

  if (logoUrl && failedUrl !== logoUrl) {
    return (
      // Logos externos del seed (URL https pública): next/image exigiría declarar cada dominio.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={decorative ? '' : name}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(logoUrl)}
        className={cx(box, 'border border-line bg-surface object-contain p-1', className)}
      />
    );
  }

  const background = brandColor && isHexColor(brandColor) ? brandColor : NEUTRAL_LOGO_BACKGROUND;
  const a11y = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img' as const, 'aria-label': name };

  return (
    <span
      data-testid="service-logo-initial"
      {...a11y}
      style={{ backgroundColor: background, color: readableTextColor(background) }}
      className={cx(box, 'font-display leading-none font-bold', className)}
    >
      {serviceInitial(name)}
    </span>
  );
}
