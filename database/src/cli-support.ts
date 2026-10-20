// Utilidades comunes de las CLI del paquete database (seed, reset, dump y restore; spec 000,
// RF-000-06). Nada de aquí imprime la cadena de conexión.
import { pathToFileURL } from 'node:url';
import { databaseUrl } from './config.ts';

// Hosts que se consideran la base local: el equipo propio y el servicio `db` de docker-compose.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'db', 'postgres']);

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// En CI y en producción no se usa la base local por defecto (mismo criterio que migrate.ts).
export function resolveConnectionString(): string {
  const strict = process.env.CI === 'true' || process.env.NODE_ENV === 'production';
  if (strict && !process.env.DATABASE_URL) {
    throw new Error(
      'Falta DATABASE_URL: en CI y en producción no se usa la base local por defecto.',
    );
  }
  return databaseUrl();
}

export function isInvokedDirectly(moduleUrl: string): boolean {
  return process.argv[1] !== undefined && moduleUrl === pathToFileURL(process.argv[1]).href;
}

function parseUrl(connectionString: string): URL {
  try {
    return new URL(connectionString);
  } catch {
    // No se repite la cadena en el mensaje: puede llevar la contraseña.
    throw new Error('La cadena de conexión no es una URL postgres:// válida.');
  }
}

// Host al que apunta la URL. Un parámetro ?host= (socket o host) manda sobre el de la URL.
export function databaseHost(connectionString: string): string {
  const url = parseUrl(connectionString);
  const fromQuery = url.searchParams.get('host');
  const host = fromQuery ?? url.hostname;
  return host.replace(/^\[(.*)\]$/, '$1').toLowerCase();
}

// Local = equipo propio, servicio de docker-compose o socket Unix (host vacío o ruta absoluta).
export function isLocalDatabaseUrl(connectionString: string): boolean {
  const host = databaseHost(connectionString);
  return host === '' || host.startsWith('/') || LOCAL_HOSTS.has(host);
}

export interface ConnectionParts {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  sslmode: string | null;
}

export function connectionParts(connectionString: string): ConnectionParts {
  const url = parseUrl(connectionString);
  return {
    host: databaseHost(connectionString),
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    sslmode: url.searchParams.get('sslmode'),
  };
}

// Variables PG* para pg_dump y psql: la contraseña viaja por entorno y no por argumentos,
// así no aparece en la lista de procesos ni en los mensajes.
export function libpqEnv(connectionString: string): NodeJS.ProcessEnv {
  const parts = connectionParts(connectionString);
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.PGSERVICE;
  delete env.PGHOSTADDR; // psql usaría esta dirección aunque la URL diga localhost
  env.PGHOST = parts.host || 'localhost';
  env.PGPORT = parts.port;
  if (parts.user) env.PGUSER = parts.user;
  if (parts.password) env.PGPASSWORD = parts.password;
  if (parts.database) env.PGDATABASE = parts.database;
  if (parts.sslmode) env.PGSSLMODE = parts.sslmode;
  return env;
}
