'use client';

import Link from 'next/link';
import { useId } from 'react';
import { Logo } from '@/components/features/brand/logo';
import { Alert, Button, Card } from '@/components/ui';
import { useMe } from '@/hooks/use-me';
import { useLogout } from '@/hooks/use-profile-actions';
import { ChangePasswordForm } from './change-password-form';
import { PhoneChangeSection } from './phone-change-section';
import { ProfileSectionNav } from './profile-section-nav';
import { ProfileDetails } from './profile-details';
import { PROFILE_MESSAGES, profileLoadErrorMessage } from './profile-errors';

function ProfileSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando tu perfil…</span>
      {[0, 1, 2].map((card) => (
        <div
          key={card}
          aria-hidden="true"
          className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 sm:p-6"
        >
          <div className="h-6 w-40 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          <div className="h-12 w-full animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          <div className="h-5 w-2/3 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

function LogoutSection() {
  const titleId = useId();
  const { logOut, isLoggingOut } = useLogout();
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 id={titleId} className="font-display text-xl font-bold">
          Sesión
        </h2>
        <p className="text-[15px] text-muted">Cierra tu sesión en este dispositivo.</p>
      </header>
      <Button
        variant="secondary"
        onClick={() => void logOut()}
        loading={isLoggingOut}
        className="w-full sm:w-auto sm:self-start"
      >
        Cerrar sesión
      </Button>
    </Card>
  );
}

/**
 * Pantalla `/perfil` (spec 003 T039, plan §6; mockup `Perfil.dc.html`). Celular primero, con las
 * tarjetas apiladas: tus datos, cambiar celular, cambiar contraseña y sesión. Los datos salen de
 * `GET /auth/me`; un `401` lleva a `/ingresar?next=/perfil` (lo hace `useMe`).
 */
export function ProfileView() {
  const { status, user, error, reload, replaceUser } = useMe();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href="/"
        aria-label="Vaquita, ir al inicio"
        className="inline-flex min-h-11 items-center self-start rounded-field no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Logo />
      </Link>
      <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
        Mi perfil
      </h1>
      <ProfileSectionNav />

      {(status === 'loading' || status === 'redirecting') && <ProfileSkeleton />}

      {status === 'error' && error && (
        <Alert
          variant="error"
          title={PROFILE_MESSAGES.loadFailed}
          action={
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          {profileLoadErrorMessage(error)}
        </Alert>
      )}

      {status === 'success' && user && (
        <>
          <ProfileDetails user={user} onUserChange={replaceUser} />
          <PhoneChangeSection phone={user.phone} onVerified={replaceUser} onReload={reload} />
          <ChangePasswordForm email={user.email} />
          <LogoutSection />
        </>
      )}
    </div>
  );
}
