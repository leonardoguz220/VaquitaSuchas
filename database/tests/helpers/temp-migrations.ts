// Carpetas temporales de migraciones para probar el ejecutor con archivos controlados.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export type MigrationFiles = Record<string, string>;

export interface TempMigrationsDir {
  readonly path: string;
  write(files: MigrationFiles): Promise<void>;
  remove(): Promise<void>;
}

export async function createMigrationsDir(files: MigrationFiles = {}): Promise<TempMigrationsDir> {
  const dir = await mkdtemp(path.join(tmpdir(), 'vaquita-migrations-'));
  const write = async (more: MigrationFiles): Promise<void> => {
    for (const [name, sql] of Object.entries(more)) {
      await writeFile(path.join(dir, name), sql, 'utf8');
    }
  };
  await write(files);
  return {
    path: dir,
    write,
    remove: () => rm(dir, { recursive: true, force: true }),
  };
}
