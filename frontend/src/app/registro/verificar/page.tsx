import type { Metadata } from 'next';
import { AuthShell } from '@/components/features/auth/auth-shell';
import { RegisterVerify } from '@/components/features/auth/register-verify';

export const metadata: Metadata = { title: 'Verifica tu celular' };

/**
 * `/registro/verificar`, paso 2 de 2 (spec 003 T024, plan §6; mockup `Verificar.dc.html`).
 * Ruta pública (subruta de `/registro`); el estado lo da `GET /auth/register/status` con la
 * cookie `vq_reg` que agrega el proxy.
 */
export default function RegisterVerifyPage() {
  return (
    <AuthShell
      step="Paso 2 de 2: tu celular"
      title="Verifica tu celular con Telegram"
      subtitle="Es el último paso para crear tu cuenta."
    >
      <RegisterVerify />
    </AuthShell>
  );
}
