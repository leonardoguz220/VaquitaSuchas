// Conexiones del paquete database. Los valores por defecto apuntan al PostgreSQL local de
// docker-compose.yml (credenciales de desarrollo, no son secretos; ver database/.env.example), en
// el puerto DB_PORT con el que se levantó (DB_PORT=5435 npm run db:up) o, sin él, en el 5432.

function localPort(): string {
  const port = process.env.DB_PORT;
  if (port === undefined || port === '') return '5432';
  // Un puerto inválido no cae en el 5432: podría ser otra base local.
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error(`DB_PORT no es un puerto válido: «${port}».`);
  }
  return port;
}

export function databaseUrl(): string {
  return process.env.DATABASE_URL || `postgres://vaquita:vaquita@localhost:${localPort()}/vaquita`;
}

export function testDatabaseUrl(): string {
  return (
    process.env.TEST_DATABASE_URL ||
    `postgres://vaquita:vaquita@localhost:${localPort()}/vaquita_test`
  );
}
