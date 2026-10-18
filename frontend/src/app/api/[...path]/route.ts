/**
 * Route Handler del proxy `/api/[...path]` (RF-000-15, contrato C de
 * `specs/000-setup-del-proyecto/contracts/api.md`). La lógica vive en `forward.ts`.
 */
import { createProxyHandler } from './forward';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const handler = createProxyHandler();

export const GET = handler;
export const HEAD = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
