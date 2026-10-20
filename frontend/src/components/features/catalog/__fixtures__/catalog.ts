/**
 * Datos de prueba fieles a `specs/004-catalogo-de-servicios/contracts/api.md`. Solo los importan
 * las pruebas: la aplicación siempre lee el catálogo de la API. Nombres y montos inventados.
 */
import type {
  CatalogCategoryOption,
  CatalogPlan,
  CatalogService,
  CatalogServiceDetail,
} from '@/services/catalog';

export const netflix: CatalogService = {
  id: '3f1c2a4e-0000-4000-8000-000000000001',
  slug: 'netflix',
  name: 'Netflix',
  category: 'video',
  categoryLabel: 'Video',
  logoUrl: 'https://cdn.example.com/logos/netflix.svg',
  brandColor: '#A4161A',
  fromPriceCents: 799,
  fromCurrency: 'USD',
  plansCount: 3,
};

/** Precio de referencia en bolivianos (con monto no redondo para ver que no se redondea). */
export const tigoPlay: CatalogService = {
  id: '3f1c2a4e-0000-4000-8000-000000000002',
  slug: 'tigo-play',
  name: 'Tigo Play',
  category: 'video',
  categoryLabel: 'Video',
  logoUrl: null,
  brandColor: '#0F5E8C',
  fromPriceCents: 2551,
  fromCurrency: 'BS',
  plansCount: 1,
};

/** Logo con URL rota: la interfaz cae a la inicial (CA-004-12). */
export const spotify: CatalogService = {
  id: '3f1c2a4e-0000-4000-8000-000000000003',
  slug: 'spotify',
  name: 'Spotify',
  category: 'musica',
  categoryLabel: 'Música',
  logoUrl: 'https://cdn.example.com/logos/no-existe.png',
  brandColor: '#14743A',
  fromPriceCents: 1799,
  fromCurrency: 'USD',
  plansCount: 2,
};

export const catalogServices: CatalogService[] = [netflix, spotify, tigoPlay];

export const netflixPlans: CatalogPlan[] = [
  {
    id: '7a9e0b10-0000-4000-8000-000000000011',
    slug: 'netflix-basico-anuncios',
    name: 'Básico con anuncios',
    priceCents: 799,
    currency: 'USD',
    maxSlots: 2,
    individualPriceCents: null,
    verifiedOn: '2026-10-15',
  },
  {
    id: '7a9e0b10-0000-4000-8000-000000000012',
    slug: 'netflix-estandar',
    name: 'Estándar',
    priceCents: 1466,
    currency: 'USD',
    maxSlots: 3,
    individualPriceCents: null,
    verifiedOn: '2026-10-15',
  },
  {
    id: '7a9e0b10-0000-4000-8000-000000000013',
    slug: 'netflix-premium',
    name: 'Premium',
    priceCents: 2299,
    currency: 'USD',
    maxSlots: 4,
    individualPriceCents: 1199,
    verifiedOn: '2026-10-15',
  },
];

export const netflixDetail: CatalogServiceDetail = {
  service: {
    id: netflix.id,
    slug: netflix.slug,
    name: netflix.name,
    category: netflix.category,
    categoryLabel: netflix.categoryLabel,
    logoUrl: netflix.logoUrl,
    brandColor: netflix.brandColor,
  },
  plans: netflixPlans,
};

export const tigoPlayDetail: CatalogServiceDetail = {
  service: {
    id: tigoPlay.id,
    slug: tigoPlay.slug,
    name: tigoPlay.name,
    category: tigoPlay.category,
    categoryLabel: tigoPlay.categoryLabel,
    logoUrl: tigoPlay.logoUrl,
    brandColor: tigoPlay.brandColor,
  },
  plans: [
    {
      id: '7a9e0b10-0000-4000-8000-000000000021',
      slug: 'tigo-play-familiar',
      name: 'Familiar',
      priceCents: 2551,
      currency: 'BS',
      maxSlots: 5,
      individualPriceCents: 1500,
      verifiedOn: null,
    },
  ],
};

/** Respuesta de `GET /catalog/categories` (RF-004-03): las seis categorías del contrato. */
export const catalogCategories: CatalogCategoryOption[] = [
  { value: 'video', label: 'Video', servicesCount: 2 },
  { value: 'musica', label: 'Música', servicesCount: 1 },
  { value: 'juegos', label: 'Juegos', servicesCount: 0 },
  { value: 'educacion', label: 'Educación', servicesCount: 0 },
  { value: 'almacenamiento', label: 'Almacenamiento', servicesCount: 0 },
  { value: 'otras', label: 'Otras', servicesCount: 0 },
];
