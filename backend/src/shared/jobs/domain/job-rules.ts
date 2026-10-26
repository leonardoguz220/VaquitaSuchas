// Reglas puras de las tareas programadas (RF-000-14). Sin NestJS ni `pg`; el reloj llega como
// parámetro (`now`).

/** Largo máximo del texto que se guarda en `job_runs.error_message`. */
export const MAX_ERROR_MESSAGE_LENGTH = 200;

// Espacio de nombres con punto (`billing.generate`): el nombre viaja por URL (`?job=`), por el
// bloqueo asesor y por los logs, así que se limita a un alfabeto seguro.
const JOB_NAME_PATTERN = /^[a-z][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)+$/;
const MAX_JOB_NAME_LENGTH = 100;

// Nombre de clase de error y código (SQLSTATE de PostgreSQL o código de red como ECONNREFUSED).
const ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,59}$/;
const ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,32}$/;

export function isValidJobName(name: unknown): name is string {
  return (
    typeof name === 'string' && name.length <= MAX_JOB_NAME_LENGTH && JOB_NAME_PATTERN.test(name)
  );
}

export function isValidIntervalSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * ¿Toca ejecutar la tarea? `lastOkStartedAt` es el inicio de su última ejecución exitosa.
 * Sin ejecución previa, o con `intervalSeconds` en 0, siempre toca. Es solo un freno de cadencia:
 * la tarea sigue siendo idempotente y decide su trabajo por el estado de la base.
 */
export function isJobDue(
  lastOkStartedAt: Date | null,
  now: Date,
  intervalSeconds: number,
): boolean {
  if (lastOkStartedAt === null || intervalSeconds <= 0) {
    return true;
  }
  return now.getTime() - lastOkStartedAt.getTime() >= intervalSeconds * 1000;
}

/**
 * Texto acotado para `job_runs.error_message` y para el log: solo el nombre del tipo de error y
 * su código si lo tiene (`Error (23001)`). Nunca el mensaje ni la traza, porque podrían contener
 * datos personales o valores de una consulta.
 */
export function describeJobError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'NonErrorThrown';
  }
  const name = ERROR_NAME_PATTERN.test(error.name) ? error.name : 'Error';
  const code = (error as { code?: unknown }).code;
  const description =
    typeof code === 'string' && ERROR_CODE_PATTERN.test(code) ? `${name} (${code})` : name;
  return description.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

/** `JOBS_INPROCESS` llega como texto desde el entorno: solo `true` activa el cron interno. */
export function isInProcessEnabled(value: unknown): boolean {
  return value === true || value === 'true';
}

// Fecha simulada del tick (`?now=`): `YYYY-MM-DD` o fecha y hora ISO con `Z`/desfase explícito.
const SIMULATED_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SIMULATED_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Interpreta el `now` simulado del tick. Una fecha sin hora se toma a las 12:00 UTC (08:00 en
 * America/La_Paz), así cae en ese mismo día en ambas zonas. Devuelve `null` si el formato no es
 * válido o la fecha no existe (por ejemplo, 2026-02-30).
 */
export function parseSimulatedNow(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null;
  }
  const dateOnly = SIMULATED_DATE_PATTERN.test(value);
  if (!dateOnly && !SIMULATED_DATETIME_PATTERN.test(value)) {
    return null;
  }
  const parsed = new Date(dateOnly ? `${value}T12:00:00.000Z` : value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  // Rechaza días inexistentes que `Date` corrige solo (2026-02-30 -> 2026-03-02).
  const datePart = value.slice(0, 10);
  return dateOnly && parsed.toISOString().slice(0, 10) !== datePart ? null : parsed;
}
