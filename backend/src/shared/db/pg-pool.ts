import type { Pool } from 'pg';

/** Token de inyección del pool de `pg`; lo provee DbModule y las pruebas lo reemplazan. */
export const PG_POOL = Symbol('PG_POOL');

/** Lo mínimo del `Pool` que usa DbService, para poder sustituirlo por uno falso en pruebas. */
export type DbPool = Pick<Pool, 'query' | 'connect' | 'end' | 'on'>;
