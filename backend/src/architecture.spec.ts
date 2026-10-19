import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Reglas de dependencias del backend (spec 001 T039, RNF-001-01): sin ciclos entre archivos y un
// dominio puro (funciones sin NestJS ni `pg`). Corre en CI con el resto de las pruebas.
const SRC = path.dirname(fileURLToPath(import.meta.url));

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listSources(full);
    return full.endsWith('.ts') && !full.endsWith('.spec.ts') ? [full] : [];
  });
}

const IMPORT = /(?:import|export)\s[^;]*?from\s+'([^']+)'/gs;

function importsOf(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(IMPORT)].map((m) => m[1] as string);
}

describe('Arquitectura del backend', () => {
  const files = listSources(SRC);
  const known = new Set(files);

  it('hay archivos que revisar', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  const graph = new Map<string, string[]>(
    files.map((file) => [
      file,
      importsOf(file)
        .filter((spec) => spec.startsWith('.'))
        .map((spec) => path.resolve(path.dirname(file), spec.replace(/\.js$/, '.ts')))
        .filter((target) => known.has(target)),
    ]),
  );

  it('RNF-001-01: no hay ciclos de importación entre archivos (incluye módulos)', () => {
    const state = new Map<string, 'visiting' | 'done'>();
    const cycles: string[] = [];
    const visit = (file: string, trail: string[]): void => {
      if (state.get(file) === 'done') return;
      if (state.get(file) === 'visiting') {
        cycles.push(
          [...trail.slice(trail.indexOf(file)), file]
            .map((f) => path.relative(SRC, f))
            .join(' -> '),
        );
        return;
      }
      state.set(file, 'visiting');
      for (const next of graph.get(file) ?? []) visit(next, [...trail, file]);
      state.set(file, 'done');
    };
    for (const file of files) visit(file, []);

    expect(cycles).toEqual([]);
  });

  it('RNF-001-03: el dominio no depende de NestJS ni de pg (solo funciones puras)', () => {
    const offenders = files
      .filter((file) => file.includes(`${path.sep}domain${path.sep}`))
      .filter((file) => importsOf(file).some((spec) => /^(@nestjs\/|pg$|pg\/)/.test(spec)))
      .map((file) => path.relative(SRC, file));

    expect(offenders).toEqual([]);
  });

  it('RNF-001-01: solo los repositorios y el almacén hablan con la base (SQL)', () => {
    const offenders = files
      .filter((file) => !/repositories|\/shared\/db\/|\/cli\/|jobs/.test(file))
      .filter((file) => /\.query\(/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file));

    expect(offenders).toEqual([]);
  });
});
