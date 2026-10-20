import type { Metadata, Viewport } from 'next';
import { Atkinson_Hyperlegible, Bricolage_Grotesque } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/features/shell/app-shell';
import './globals.css';

/** Títulos (`font-display`), según frontend/design/mockups/README.md. */
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700'],
  display: 'swap',
  variable: '--font-bricolage',
});

/** Texto de la interfaz (`font-sans`), pensado para baja visión. */
const atkinson = Atkinson_Hyperlegible({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-atkinson',
});

export const metadata: Metadata = {
  title: { default: 'Vaquita', template: '%s · Vaquita' },
  description:
    'Organiza las suscripciones compartidas con tus amigos, familia o compañeros de departamento: cuotas, cobros y comprobantes en un solo lugar.',
};

export const viewport: Viewport = {
  themeColor: '#1E6B4E',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es-BO" className={`${bricolage.variable} ${atkinson.variable}`}>
      <body className="bg-bg font-sans text-ink antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
