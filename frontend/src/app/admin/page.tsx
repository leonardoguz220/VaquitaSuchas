import { redirect } from 'next/navigation';
import { ADMIN_USERS_PATH } from '@/lib/routes';

/** `/admin`: mientras no exista el tablero de estadísticas (T035), lleva a Usuarios. */
export default function AdminHomePage(): never {
  redirect(ADMIN_USERS_PATH);
}
