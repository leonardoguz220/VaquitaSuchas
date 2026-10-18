// Conexiones del paquete database. Los valores por defecto apuntan al PostgreSQL local de
// docker-compose.yml (credenciales de desarrollo, no son secretos; ver database/.env.example).
const LOCAL_DEFAULTS = {
  databaseUrl: 'postgres://vaquita:vaquita@localhost:5432/vaquita',
  testDatabaseUrl: 'postgres://vaquita:vaquita@localhost:5432/vaquita_test',
} as const;

export function databaseUrl(): string {
  return process.env.DATABASE_URL || LOCAL_DEFAULTS.databaseUrl;
}

export function testDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL || LOCAL_DEFAULTS.testDatabaseUrl;
}
