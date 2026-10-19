'use client';

import { useState } from 'react';
import { cx } from '@/components/ui/cx';
import { brandTileColors, initialOf } from '@/lib/brand-color';

export type ServiceLogoSize = 'md' | 'lg';

export interface ServiceLogoProps {
  /** Nombre del servicio: de él sale la inicial del respaldo. */
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
  size?: ServiceLogoSize;
  className?: string;
}

const sizes: Record<ServiceLogoSize, string> = {
  md: 'size-12 text-[22px]',
  lg: 'size-14 text-2xl',
};

/**
 * Logo de un servicio del catálogo (plan 004 §6, CA-004-12). Si no hay URL o la imagen falla,
 * muestra la inicial sobre el color de marca. Es decorativo: el nombre del servicio siempre va
 * como texto al lado, así que el lector de pantalla no lo lee dos veces. La imagen se pide con
 * `referrerPolicy="no-referrer"` (plan 004 §7) y no se ejecuta nada de la URL.
 */
export function ServiceLogo({
  name,
  logoUrl,
  brandColor,
  size = 'md',
  className,
}: ServiceLogoProps) {
  // Se guarda la URL que falló para volver a intentar si cambia el logo.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(logoUrl) && failedUrl !== logoUrl;
  const tile = cx(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-field',
    sizes[size],
    className,
  );

  if (showImage && logoUrl) {
    return (
      <span aria-hidden="true" data-testid="service-logo" className={cx(tile, 'bg-surface')}>
        {/* URL externa de cualquier dominio (seed del catálogo): next/image exigiría listarlos. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          className="size-full object-contain"
          onError={() => setFailedUrl(logoUrl)}
        />
      </span>
    );
  }

  const colors = brandTileColors(brandColor);
  return (
    <span
      aria-hidden="true"
      data-testid="service-logo"
      className={cx(tile, 'font-display font-bold')}
      style={{ backgroundColor: colors.background, color: colors.color }}
    >
      {initialOf(name)}
    </span>
  );
}
