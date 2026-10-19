// Seed del catálogo de servicios (spec 004, RF-004-07, RNF-004-03, RNF-004-04, RN-004-06;
// data-model.md §2). El catálogo vive en database/seeds/catalog.json; este módulo lo valida
// entero antes de escribir y lo aplica por slug, de forma idempotente:
// - una fila igual a la del archivo no se reescribe (ni cambia updated_at; CA-004-05);
// - is_active nunca se toca: la desactivación es decisión del administrador (spec 009);
// - un plan que ya no figura en el archivo no se borra;
// - un plan cuyo slug ya pertenece a otro servicio es un error, no se mueve en silencio.
import type pg from 'pg';

export interface CatalogPlanInput {
  slug: string;
  name: string;
  priceCents: number;
  currency: 'USD' | 'BS';
  maxSlots: number;
  individualPriceCents?: number | null;
  verifiedOn: string;
  verifiedSource: string;
  sortOrder?: number;
}

export interface CatalogServiceInput {
  slug: string;
  name: string;
  category: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  plans: CatalogPlanInput[];
}

export interface CatalogData {
  services: CatalogServiceInput[];
}

export interface CatalogCounts {
  services: number;
  plans: number;
}

export class CatalogValidationError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`El catálogo tiene ${problems.length} problema(s):\n- ${problems.join('\n- ')}`);
    this.name = 'CatalogValidationError';
    this.problems = problems;
  }
}

// Mismas reglas que las restricciones de 0020_catalog.sql.
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const BRAND_COLOR = /^#[0-9A-Fa-f]{6}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CATEGORIES = new Set(['video', 'musica', 'juegos', 'educacion', 'almacenamiento', 'otras']);
const CURRENCIES = new Set(['USD', 'BS']);
const MIN_SLOTS = 2;
const MAX_SLOTS = 20;
const MAX_SORT_ORDER = 32767; // smallint

const SERVICE_KEYS = new Set(['slug', 'name', 'category', 'logoUrl', 'brandColor', 'plans']);
const PLAN_KEYS = new Set([
  'slug',
  'name',
  'priceCents',
  'currency',
  'maxSlots',
  'individualPriceCents',
  'verifiedOn',
  'verifiedSource',
  'sortOrder',
]);

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

// Clave de nombre duplicado: equivale a immutable_unaccent(lower(btrim(name))) de la base.
export function serviceNameKey(name: string): string {
  return name.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function checkName(value: unknown, where: string, problems: string[]): string {
  if (typeof value !== 'string') {
    problems.push(`${where}: name es obligatorio y debe ser texto`);
    return '';
  }
  const length = value.trim().length;
  if (length < 2 || length > 60) {
    problems.push(`${where}: name debe tener de 2 a 60 caracteres (tiene ${length})`);
  }
  return value.trim();
}

function checkUnknownKeys(raw: Raw, allowed: Set<string>, where: string, problems: string[]) {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) problems.push(`${where}: campo desconocido ${key}`);
  }
}

function validatePlan(
  raw: unknown,
  where: string,
  index: number,
  problems: string[],
): CatalogPlanInput {
  if (!isObject(raw)) {
    problems.push(`${where}: el plan debe ser un objeto`);
    return {} as CatalogPlanInput;
  }
  checkUnknownKeys(raw, PLAN_KEYS, where, problems);

  const name = checkName(raw.name, where, problems);
  if (!isPositiveInteger(raw.priceCents)) {
    problems.push(`${where}: priceCents debe ser un entero mayor que 0 (centavos)`);
  }
  if (typeof raw.currency !== 'string' || !CURRENCIES.has(raw.currency)) {
    problems.push(`${where}: currency debe ser 'USD' o 'BS'`);
  }
  if (
    typeof raw.maxSlots !== 'number' ||
    !Number.isInteger(raw.maxSlots) ||
    raw.maxSlots < MIN_SLOTS ||
    raw.maxSlots > MAX_SLOTS
  ) {
    problems.push(`${where}: maxSlots debe ser un entero de ${MIN_SLOTS} a ${MAX_SLOTS}`);
  }
  const individual = raw.individualPriceCents;
  if (individual !== undefined && individual !== null && !isPositiveInteger(individual)) {
    problems.push(`${where}: individualPriceCents debe ser null o un entero mayor que 0`);
  }
  if (typeof raw.verifiedOn !== 'string' || !isValidIsoDate(raw.verifiedOn)) {
    problems.push(
      `${where}: verifiedOn es obligatorio y debe ser una fecha AAAA-MM-DD válida (RN-004-06)`,
    );
  }
  if (typeof raw.verifiedSource !== 'string' || raw.verifiedSource.trim() === '') {
    problems.push(`${where}: verifiedSource es obligatorio y no puede estar vacío (RN-004-06)`);
  }
  const sortOrder = raw.sortOrder;
  if (
    sortOrder !== undefined &&
    (typeof sortOrder !== 'number' ||
      !Number.isInteger(sortOrder) ||
      sortOrder < 0 ||
      sortOrder > MAX_SORT_ORDER)
  ) {
    problems.push(`${where}: sortOrder debe ser un entero de 0 a ${MAX_SORT_ORDER}`);
  }

  return {
    slug: raw.slug as string,
    name,
    priceCents: raw.priceCents as number,
    currency: raw.currency as 'USD' | 'BS',
    maxSlots: raw.maxSlots as number,
    individualPriceCents: (individual ?? null) as number | null,
    verifiedOn: raw.verifiedOn as string,
    verifiedSource: typeof raw.verifiedSource === 'string' ? raw.verifiedSource.trim() : '',
    sortOrder: (sortOrder as number | undefined) ?? index,
  };
}

function checkSlug(
  value: unknown,
  label: string,
  seen: Map<string, string>,
  where: string,
  problems: string[],
): void {
  if (typeof value !== 'string' || !SLUG.test(value)) {
    problems.push(
      `${where}: slug ${JSON.stringify(value)} no es válido (minúsculas, dígitos y guiones simples)`,
    );
    return;
  }
  const previous = seen.get(value);
  if (previous) {
    problems.push(`${where}: slug de ${label} "${value}" repetido (ya lo usa ${previous})`);
  } else {
    seen.set(value, where);
  }
}

// Valida todo el archivo y lanza CatalogValidationError con todos los problemas encontrados.
// Cada problema nombra el servicio o plan (por slug, o por posición si no lo tiene) y el campo.
export function validateCatalog(data: unknown): CatalogData {
  const problems: string[] = [];
  if (!isObject(data) || !Array.isArray(data.services)) {
    throw new CatalogValidationError(['catálogo: debe ser un objeto { "services": [ ... ] }']);
  }
  checkUnknownKeys(data, new Set(['services']), 'catálogo', problems);
  if (data.services.length === 0) problems.push('catálogo: services no puede estar vacío');

  const serviceSlugs = new Map<string, string>();
  const planSlugs = new Map<string, string>();
  const serviceNames = new Map<string, string>();
  const services: CatalogServiceInput[] = [];

  data.services.forEach((raw: unknown, serviceIndex: number) => {
    const fallback = `services[${serviceIndex}]`;
    if (!isObject(raw)) {
      problems.push(`${fallback}: el servicio debe ser un objeto`);
      return;
    }
    const where =
      typeof raw.slug === 'string' && raw.slug !== '' ? `servicio "${raw.slug}"` : fallback;
    checkUnknownKeys(raw, SERVICE_KEYS, where, problems);
    checkSlug(raw.slug, 'servicio', serviceSlugs, where, problems);

    const name = checkName(raw.name, where, problems);
    if (name !== '') {
      const key = serviceNameKey(name);
      const previous = serviceNames.get(key);
      if (previous) {
        problems.push(
          `${where}: name "${name}" repite el nombre de ${previous} (sin contar mayúsculas, tildes ni espacios)`,
        );
      } else {
        serviceNames.set(key, where);
      }
    }
    if (typeof raw.category !== 'string' || !CATEGORIES.has(raw.category)) {
      problems.push(`${where}: category debe ser una de ${[...CATEGORIES].join(', ')}`);
    }
    const logoUrl = raw.logoUrl ?? null;
    if (logoUrl !== null && (typeof logoUrl !== 'string' || !/^https:\/\/\S+$/.test(logoUrl))) {
      problems.push(`${where}: logoUrl debe ser null o una URL que empiece con https://`);
    }
    const brandColor = raw.brandColor ?? null;
    if (brandColor !== null && (typeof brandColor !== 'string' || !BRAND_COLOR.test(brandColor))) {
      problems.push(`${where}: brandColor debe ser null o un color #RRGGBB`);
    }

    const plans: CatalogPlanInput[] = [];
    if (!Array.isArray(raw.plans) || raw.plans.length === 0) {
      problems.push(`${where}: plans debe tener al menos un plan`);
    } else {
      raw.plans.forEach((plan: unknown, planIndex: number) => {
        const planSlug = isObject(plan) ? plan.slug : undefined;
        const planWhere =
          typeof planSlug === 'string' && planSlug !== ''
            ? `plan "${planSlug}" (${where})`
            : `${where}, plans[${planIndex}]`;
        checkSlug(planSlug, 'plan', planSlugs, planWhere, problems);
        plans.push(validatePlan(plan, planWhere, planIndex, problems));
      });
    }

    services.push({
      slug: raw.slug as string,
      name,
      category: raw.category as string,
      logoUrl: logoUrl as string | null,
      brandColor: brandColor as string | null,
      plans,
    });
  });

  if (problems.length > 0) throw new CatalogValidationError(problems);
  return { services };
}

const UPSERT_SERVICE = `
  INSERT INTO catalog_services AS s (slug, name, category, logo_url, brand_color)
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    logo_url = EXCLUDED.logo_url,
    brand_color = EXCLUDED.brand_color
  WHERE (s.name, s.category, s.logo_url, s.brand_color)
    IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.category, EXCLUDED.logo_url, EXCLUDED.brand_color)
  RETURNING id`;

// service_id no se actualiza: si el slug ya es de otro servicio, la fila no cambia y se informa.
const UPSERT_PLAN = `
  INSERT INTO catalog_plans AS p
    (service_id, slug, name, price_cents, currency, max_slots, individual_price_cents,
     verified_on, verified_source, sort_order)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    price_cents = EXCLUDED.price_cents,
    currency = EXCLUDED.currency,
    max_slots = EXCLUDED.max_slots,
    individual_price_cents = EXCLUDED.individual_price_cents,
    verified_on = EXCLUDED.verified_on,
    verified_source = EXCLUDED.verified_source,
    sort_order = EXCLUDED.sort_order
  WHERE p.service_id = EXCLUDED.service_id
    AND (p.name, p.price_cents, p.currency, p.max_slots, p.individual_price_cents,
         p.verified_on, p.verified_source, p.sort_order)
    IS DISTINCT FROM
        (EXCLUDED.name, EXCLUDED.price_cents, EXCLUDED.currency, EXCLUDED.max_slots,
         EXCLUDED.individual_price_cents, EXCLUDED.verified_on, EXCLUDED.verified_source,
         EXCLUDED.sort_order)
  RETURNING id`;

async function upsertService(client: pg.ClientBase, service: CatalogServiceInput): Promise<string> {
  const { rows } = await client.query<{ id: string }>(UPSERT_SERVICE, [
    service.slug,
    service.name,
    service.category,
    service.logoUrl ?? null,
    service.brandColor ?? null,
  ]);
  if (rows[0]) return rows[0].id;
  // La fila ya era igual a la del archivo: no se reescribió y RETURNING no devuelve nada.
  const existing = await client.query<{ id: string }>(
    'SELECT id FROM catalog_services WHERE slug = $1',
    [service.slug],
  );
  const id = existing.rows[0]?.id;
  if (!id) throw new Error(`No se encontró el servicio "${service.slug}" tras escribirlo.`);
  return id;
}

async function upsertPlan(
  client: pg.ClientBase,
  serviceId: string,
  serviceSlug: string,
  plan: CatalogPlanInput,
  index: number,
): Promise<void> {
  const { rowCount } = await client.query(UPSERT_PLAN, [
    serviceId,
    plan.slug,
    plan.name,
    plan.priceCents,
    plan.currency,
    plan.maxSlots,
    plan.individualPriceCents ?? null,
    plan.verifiedOn,
    plan.verifiedSource,
    plan.sortOrder ?? index,
  ]);
  if (rowCount && rowCount > 0) return;
  // Sin filas: o el plan ya estaba igual, o su slug pertenece a otro servicio.
  const existing = await client.query<{ service_slug: string }>(
    `SELECT s.slug AS service_slug FROM catalog_plans p
     JOIN catalog_services s ON s.id = p.service_id WHERE p.slug = $1`,
    [plan.slug],
  );
  const owner = existing.rows[0]?.service_slug;
  if (owner !== undefined && owner !== serviceSlug) {
    throw new CatalogValidationError([
      `plan "${plan.slug}" (servicio "${serviceSlug}"): slug ya pertenece al servicio "${owner}"; ` +
        'un plan no se mueve de servicio desde el seed',
    ]);
  }
}

// Escribe un catálogo ya validado. No abre transacción propia: la usa seed() dentro de la suya;
// fuera de seed() se llama a través de applyCatalog.
export async function writeCatalog(
  client: pg.ClientBase,
  data: CatalogData,
): Promise<CatalogCounts> {
  let plans = 0;
  for (const service of data.services) {
    const serviceId = await upsertService(client, service);
    for (const [index, plan] of service.plans.entries()) {
      await upsertPlan(client, serviceId, service.slug, plan, index);
      plans += 1;
    }
  }
  return { services: data.services.length, plans };
}

// Valida todo el archivo y lo aplica en una sola transacción (RNF-004-03, CA-004-06).
export async function applyCatalog(client: pg.ClientBase, data: unknown): Promise<CatalogCounts> {
  const catalog = validateCatalog(data);
  await client.query('BEGIN');
  try {
    const result = await writeCatalog(client, catalog);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}
