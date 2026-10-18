import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vaquita',
  description: 'Suscripciones compartidas entre amigos, familia o compañeros de departamento.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es-BO">
      <body>{children}</body>
    </html>
  );
}
