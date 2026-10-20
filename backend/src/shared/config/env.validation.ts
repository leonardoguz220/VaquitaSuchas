import { plainToInstance, Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
  type ValidationError,
} from 'class-validator';
import { FRONTEND_ORIGIN_MESSAGE, FRONTEND_ORIGIN_PATTERN } from '../http/frontend-origin.js';

// Validación de las variables de entorno al arrancar (RF-000-08, CA-000-05).
// Los mensajes nombran las variables pero nunca imprimen sus valores: pueden ser secretos.

const NODE_ENVS = ['development', 'test', 'production'] as const;
const MAIL_MODES = ['dev', 'prod'] as const;
const TELEGRAM_MODES = ['dev', 'prod'] as const;
const STORAGE_DRIVERS = ['local', 'supabase'] as const;
const MAIL_PROVIDERS = ['resend', 'brevo'] as const;

const MIN_PORT = 1;
const MAX_PORT = 65535;
// Mínimos indicados en backend/.env.example (JWT_SECRET: 32 caracteres; JOBS_TOKEN: 32 bytes).
const MIN_SECRET_LENGTH = 32;
// 32 bytes en hexadecimal (64 caracteres) o en base64 (43 caracteres y un «=»).
const CI_ENCRYPTION_KEY_PATTERN = /^(?:[0-9a-fA-F]{64}|[A-Za-z0-9+/]{43}=)$/;
const POSTGRES_URL_PATTERN = /^postgres(?:ql)?:\/\/\S+$/;

const MISSING_MESSAGE = 'falta o está en blanco';

/** Las variables en blanco (`NOMBRE=` en un .env) se tratan como no definidas. */
function blankToUndefined({ value }: { value: unknown }): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

/** PORT llega como texto desde process.env; solo se convierte si es un entero en dígitos. */
function portToNumber({ value }: { value: unknown }): unknown {
  const normalized = blankToUndefined({ value });
  return typeof normalized === 'string' && /^\d+$/.test(normalized.trim())
    ? Number(normalized.trim())
    : normalized;
}

function oneOf(values: readonly string[]): string {
  return `debe ser uno de: ${values.join(', ')}`;
}

const isMailProd = (env: EnvVars): boolean => env.MAIL_MODE === 'prod';
// Resend es el proveedor por omisión: solo MAIL_PROVIDER=brevo cambia la clave que se exige.
const isResend = (env: EnvVars): boolean => isMailProd(env) && env.MAIL_PROVIDER !== 'brevo';
const isBrevo = (env: EnvVars): boolean => isMailProd(env) && env.MAIL_PROVIDER === 'brevo';
const isTelegramProd = (env: EnvVars): boolean => env.TELEGRAM_MODE === 'prod';
const isSupabase = (env: EnvVars): boolean => env.STORAGE_DRIVER === 'supabase';

/** Qué modo vuelve obligatoria cada variable condicional, para el mensaje de «falta». */
const REQUIRED_WHEN: Readonly<Record<string, string>> = {
  RESEND_API_KEY: 'MAIL_MODE=prod y MAIL_PROVIDER=resend',
  BREVO_API_KEY: 'MAIL_MODE=prod y MAIL_PROVIDER=brevo',
  MAIL_FROM: 'MAIL_MODE=prod',
  TELEGRAM_BOT_TOKEN: 'TELEGRAM_MODE=prod',
  TELEGRAM_WEBHOOK_SECRET: 'TELEGRAM_MODE=prod',
  SUPABASE_URL: 'STORAGE_DRIVER=supabase',
  SUPABASE_SERVICE_KEY: 'STORAGE_DRIVER=supabase',
  SUPABASE_BUCKET: 'STORAGE_DRIVER=supabase',
};

export class EnvVars {
  @Transform(blankToUndefined)
  @IsIn(NODE_ENVS, { message: oneOf(NODE_ENVS) })
  NODE_ENV!: string;

  @Transform(portToNumber)
  @IsInt({ message: 'debe ser un número entero' })
  @Min(MIN_PORT, { message: `debe estar entre ${MIN_PORT} y ${MAX_PORT}` })
  @Max(MAX_PORT, { message: `debe estar entre ${MIN_PORT} y ${MAX_PORT}` })
  PORT!: number;

  @Transform(blankToUndefined)
  @Matches(POSTGRES_URL_PATTERN, {
    message: 'debe ser una URL postgresql://usuario:clave@host:puerto/base',
  })
  DATABASE_URL!: string;

  @Transform(blankToUndefined)
  @IsString()
  @MinLength(MIN_SECRET_LENGTH, { message: `debe tener al menos ${MIN_SECRET_LENGTH} caracteres` })
  JWT_SECRET!: string;

  @Transform(blankToUndefined)
  @IsString()
  @IsNotEmpty()
  FINGERPRINT_KEY!: string;

  @Transform(blankToUndefined)
  @Matches(CI_ENCRYPTION_KEY_PATTERN, {
    message: 'debe ser una clave de 32 bytes en hexadecimal o base64',
  })
  CI_ENCRYPTION_KEY!: string;

  @Transform(blankToUndefined)
  @IsString()
  @MinLength(MIN_SECRET_LENGTH, { message: `debe tener al menos ${MIN_SECRET_LENGTH} caracteres` })
  JOBS_TOKEN!: string;

  @Transform(blankToUndefined)
  @IsIn(MAIL_MODES, { message: oneOf(MAIL_MODES) })
  MAIL_MODE!: string;

  @Transform(blankToUndefined)
  @IsIn(TELEGRAM_MODES, { message: oneOf(TELEGRAM_MODES) })
  TELEGRAM_MODE!: string;

  @Transform(blankToUndefined)
  @IsIn(STORAGE_DRIVERS, { message: oneOf(STORAGE_DRIVERS) })
  STORAGE_DRIVER!: string;

  // --- Opcional: origen del frontend permitido por CORS (RF-000-10) ---
  // Sin ella CORS queda cerrado del todo: el navegador no llama al backend, lo hace el proxy /api.
  @Transform(blankToUndefined)
  @ValidateIf((env: EnvVars) => env.FRONTEND_ORIGIN !== undefined)
  @Matches(FRONTEND_ORIGIN_PATTERN, { message: FRONTEND_ORIGIN_MESSAGE })
  FRONTEND_ORIGIN?: string;

  // --- Opcional: contacto de apelaciones que lleva el correo de suspensión (spec 009, RF-009-11) ---
  @Transform(blankToUndefined)
  @ValidateIf((env: EnvVars) => env.APPEAL_EMAIL !== undefined)
  @IsEmail({}, { message: 'debe ser un correo válido' })
  APPEAL_EMAIL?: string;

  // --- Opcionales del correo (RF-000-12): Mailpit en dev y proveedor en prod ---
  @Transform(portToNumber)
  @ValidateIf((env: EnvVars) => env.SMTP_PORT !== undefined)
  @IsInt({ message: 'debe ser un número entero' })
  @Min(MIN_PORT, { message: `debe estar entre ${MIN_PORT} y ${MAX_PORT}` })
  @Max(MAX_PORT, { message: `debe estar entre ${MIN_PORT} y ${MAX_PORT}` })
  SMTP_PORT?: number;

  @Transform(blankToUndefined)
  @ValidateIf((env: EnvVars) => env.MAIL_PROVIDER !== undefined)
  @IsIn(MAIL_PROVIDERS, { message: oneOf(MAIL_PROVIDERS) })
  MAIL_PROVIDER?: string;

  // --- Solo MAIL_MODE=prod ---
  @Transform(blankToUndefined)
  @ValidateIf(isResend)
  @IsString()
  @IsNotEmpty()
  RESEND_API_KEY?: string;

  @Transform(blankToUndefined)
  @ValidateIf(isBrevo)
  @IsString()
  @IsNotEmpty()
  BREVO_API_KEY?: string;

  @Transform(blankToUndefined)
  @ValidateIf(isMailProd)
  @IsString()
  @IsNotEmpty()
  MAIL_FROM?: string;

  // --- Solo TELEGRAM_MODE=prod ---
  @Transform(blankToUndefined)
  @ValidateIf(isTelegramProd)
  @IsString()
  @IsNotEmpty()
  TELEGRAM_BOT_TOKEN?: string;

  @Transform(blankToUndefined)
  @ValidateIf(isTelegramProd)
  @IsString()
  @IsNotEmpty()
  TELEGRAM_WEBHOOK_SECRET?: string;

  // --- Solo STORAGE_DRIVER=supabase ---
  @Transform(blankToUndefined)
  @ValidateIf(isSupabase)
  @IsString()
  @IsNotEmpty()
  SUPABASE_URL?: string;

  @Transform(blankToUndefined)
  @ValidateIf(isSupabase)
  @IsString()
  @IsNotEmpty()
  SUPABASE_SERVICE_KEY?: string;

  @Transform(blankToUndefined)
  @ValidateIf(isSupabase)
  @IsString()
  @IsNotEmpty()
  SUPABASE_BUCKET?: string;
}

function describeError(error: ValidationError, instance: EnvVars): string {
  const { property } = error;
  const isMissing = (instance as unknown as Record<string, unknown>)[property] === undefined;

  if (isMissing) {
    const condition = REQUIRED_WHEN[property];
    return condition
      ? `${property}: falta (obligatoria con ${condition})`
      : `${property}: ${MISSING_MESSAGE}`;
  }

  // Solo se usan los textos definidos arriba: los valores recibidos nunca llegan al mensaje.
  const reasons = Object.values(error.constraints ?? {});
  return `${property}: ${reasons.join('; ')}`;
}

/**
 * Valida el entorno completo y reúne todos los problemas en un único Error cuyo mensaje
 * lista las variables faltantes o inválidas. Devuelve la configuración original sin cambios.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const instance = plainToInstance(EnvVars, config);
  const errors = validateSync(instance, {
    skipMissingProperties: false,
    validationError: { target: false, value: false },
  });

  if (errors.length > 0) {
    const lines = errors.map((error) => `  - ${describeError(error, instance)}`);
    throw new Error(
      [
        'Variables de entorno inválidas o faltantes. Corrígelas (ver backend/.env.example):',
        ...lines,
      ].join('\n'),
    );
  }

  return config;
}
