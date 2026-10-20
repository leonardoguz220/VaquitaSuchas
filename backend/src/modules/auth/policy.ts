// Política de datos vigente que se acepta al registrarse (RF-003-23). La versión se guarda en
// `users.data_policy_version`; GET /auth/policy sirve este texto.
export const DATA_POLICY_VERSION = '2026-10-18';

export const DATA_POLICY_TEXT = [
  'Vaquita guarda tu nombre, correo, cédula de identidad y celular para administrar suscripciones compartidas.',
  'Tu cédula se guarda cifrada y nunca la ve otro miembro. Tu celular solo lo ven el titular y los miembros de tus grupos.',
  'Usamos Telegram únicamente para verificar tu celular al registrarte.',
  'Puedes pedir la corrección de tus datos desde tu perfil.',
].join('\n\n');
