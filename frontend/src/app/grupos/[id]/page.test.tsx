import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { memberGroup, ownerGroup } from '@/components/features/groups/__fixtures__/groups';
import { GroupDetailView } from '@/components/features/groups/group-detail';
import { isPublicPath } from '@/lib/routes';
import { getGroup } from '@/services/groups';
import { ApiError } from '@/services/http';
import GroupPage from './page';

jest.mock('@/services/groups', () => ({ getGroup: jest.fn() }));
jest.mock('@/components/features/charges/group-charges-tab', () => ({
  GroupChargesTab: (props: { groupId: string; isOwner: boolean; reviewQueue?: unknown }) => (
    <p>{`Cobros de ${props.groupId} · titular: ${String(props.isOwner)}`}</p>
  ),
}));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/grupos/abc',
}));

const mocked = jest.mocked(getGroup);

beforeEach(() => {
  mocked.mockReset();
  replace.mockReset();
  window.history.replaceState(null, '', '/grupos/abc');
  mocked.mockResolvedValue(memberGroup);
});

function breakdownRow(label: string) {
  const term = within(screen.getByLabelText('Desglose de la cuota')).getByText(label);
  return term.nextElementSibling;
}

describe('/grupos/[id] (T020, plan 001 §6)', () => {
  it('lee el id de la ruta y la ruta exige sesión', async () => {
    render(await GroupPage({ params: Promise.resolve({ id: memberGroup.id }) }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Spotify depa' })).toBeVisible();
    expect(mocked).toHaveBeenCalledWith(memberGroup.id, { signal: expect.any(AbortSignal) });
    expect(isPublicPath('/grupos/abc')).toBe(false);
  });

  it('RNF-001-04: mientras carga muestra esqueletos', () => {
    mocked.mockReturnValue(new Promise(() => {}));
    render(<GroupDetailView groupId="abc" />);
    expect(screen.getByText('Cargando el grupo…')).toBeInTheDocument();
  });

  it('CA-001-10: un grupo ajeno (404) muestra «Grupo no encontrado»', async () => {
    mocked.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    render(<GroupDetailView groupId="ajeno" />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Grupo no encontrado' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ir a Mis suscripciones' })).toHaveAttribute(
      'href',
      '/grupos',
    );
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('RNF-001-04: un error permite reintentar y sin conexión lo dice', async () => {
    const user = userEvent.setup();
    mocked.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    render(<GroupDetailView groupId="abc" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión con el servidor.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Spotify depa' })).toBeVisible();
  });

  it('CA-001-20: el miembro ve su rol, su cuota y el desglose de la API sin recalcular', async () => {
    render(<GroupDetailView groupId={memberGroup.id} />);
    expect(await screen.findByText('Eres miembro')).toBeVisible();
    expect(
      screen.getByText('Spotify · Familiar · 6 de 6 cupos · Cobro el día 18 de cada mes'),
    ).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Tu cuota' })).toBeVisible();
    expect(screen.getByText('Bs 19,80', { selector: 'p' })).toBeVisible();

    expect(breakdownRow('Precio del plan')).toHaveTextContent('USD 17,07');
    expect(breakdownRow('Tipo de cambio que definió el titular')).toHaveTextContent(
      'Bs 6,96 por USD 1',
    );
    expect(breakdownRow('Total del mes')).toHaveTextContent('Bs 118,81');
    expect(breakdownRow('Miembros, contando al titular')).toHaveTextContent('6');
    expect(breakdownRow('Cuota base de cada miembro')).toHaveTextContent('Bs 19,80');
    expect(breakdownRow('Cuota de referencia del titular')).toHaveTextContent('Bs 19,81');
    expect(breakdownRow('Resto del redondeo (lo asume el titular)')).toHaveTextContent('Bs 0,01');
  });

  it('CA-001-21: el titular ve su cuota como referencia; en Bs no hay tipo de cambio', async () => {
    mocked.mockResolvedValue(ownerGroup);
    render(<GroupDetailView groupId={ownerGroup.id} />);
    expect(await screen.findByText('Eres titular')).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Cuota de referencia' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Tu cuota' })).not.toBeInTheDocument();
    expect(screen.getByText(/esta cuota es solo de referencia/)).toBeVisible();
    expect(breakdownRow('Precio del plan')).toHaveTextContent('Bs 60,00');
    expect(screen.queryByText('Tipo de cambio que definió el titular')).not.toBeInTheDocument();
  });

  it('RF-001-22: ventana de ingreso «abierta hasta…» y «se abre el…» en hora de La Paz', async () => {
    const { unmount } = render(<GroupDetailView groupId={memberGroup.id} />);
    const open = await screen.findByRole('region', { name: 'Ventana de ingreso' });
    expect(open).toHaveTextContent('Abierta hasta el 20 oct 2026, 23:59.');
    unmount();

    mocked.mockResolvedValue(ownerGroup);
    render(<GroupDetailView groupId={ownerGroup.id} />);
    const closed = await screen.findByRole('region', { name: 'Ventana de ingreso' });
    expect(closed).toHaveTextContent('Cerrada. Se abre el 5 nov 2026.');
  });

  it('RF-001-22: si acceptingMembers es false dice que no recibe miembros', async () => {
    mocked.mockResolvedValue({
      ...memberGroup,
      entryWindow: { ...memberGroup.entryWindow, acceptingMembers: false },
    });
    render(<GroupDetailView groupId={memberGroup.id} />);
    const section = await screen.findByRole('region', { name: 'Ventana de ingreso' });
    expect(within(section).getByText('No recibe miembros')).toBeVisible();
    expect(section).toHaveTextContent('Este grupo no recibe miembros nuevos.');
  });

  it('CA-001-23: muestra los datos de pago con texto y QR', async () => {
    render(<GroupDetailView groupId={memberGroup.id} />);
    const section = await screen.findByRole('region', { name: 'Datos de pago' });
    expect(within(section).getByText(memberGroup.paymentInfo.text as string)).toBeVisible();
    expect(
      within(section).getByRole('img', { name: 'QR de pago de Spotify depa' }),
    ).toHaveAttribute('src', memberGroup.paymentInfo.qrUrl);
  });

  it('CA-001-23: sin datos de pago configurados muestra un aviso', async () => {
    mocked.mockResolvedValue({ ...ownerGroup, myRole: 'miembro', inviteCode: undefined });
    render(<GroupDetailView groupId={ownerGroup.id} />);
    const section = await screen.findByRole('region', { name: 'Datos de pago' });
    expect(within(section).getByRole('status')).toHaveTextContent('Todavía no hay datos de pago.');
    expect(within(section).queryByRole('img')).not.toBeInTheDocument();
  });

  it('RF-001-12: pestaña Miembros con nombre, rol, celular solo si llega y fecha de ingreso', async () => {
    const user = userEvent.setup();
    render(<GroupDetailView groupId={memberGroup.id} />);
    await user.click(await screen.findByRole('tab', { name: 'Miembros' }));
    expect(screen.getByRole('tab', { name: 'Miembros' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Miembros');

    const items = within(screen.getByRole('list', { name: 'Miembros del grupo' })).getAllByRole(
      'listitem',
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Marco Vargas Rojas');
    expect(within(items[0]).getByText('Titular')).toBeVisible();
    expect(items[0]).toHaveTextContent('Celular: +591 76543210');
    expect(items[0]).toHaveTextContent('Desde el 18 mar 2026');
    expect(within(items[1]).getByText('Miembro')).toBeVisible();
    expect(items[1]).not.toHaveTextContent('Celular');
  });

  it('RNF-001-04: las pestañas siguen el patrón ARIA y se recorren con las flechas', async () => {
    const user = userEvent.setup();
    render(<GroupDetailView groupId={memberGroup.id} />);
    const summary = await screen.findByRole('tab', { name: 'Resumen' });
    expect(screen.getByRole('tablist', { name: 'Secciones del grupo' })).toBeVisible();
    expect(summary).toHaveAttribute('aria-selected', 'true');
    summary.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Miembros' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Miembros (2)' })).toBeVisible();
    await user.keyboard('{Home}');
    expect(summary).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Resumen');
  });

  it('CA-002-17: la pestaña Cobros monta el resumen e historial del grupo según el rol', async () => {
    const user = userEvent.setup();
    render(<GroupDetailView groupId={memberGroup.id} />);
    await user.click(await screen.findByRole('tab', { name: 'Cobros' }));
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Cobros');
    expect(screen.getByText(`Cobros de ${memberGroup.id} · titular: false`)).toBeInTheDocument();
  });

  it('el panel del titular solo se monta para el titular', async () => {
    const ownerPanel = jest.fn(() => <p>Panel del titular</p>);
    const { unmount } = render(
      <GroupDetailView groupId={memberGroup.id} ownerPanel={ownerPanel} />,
    );
    await screen.findByText('Eres miembro');
    expect(screen.queryByText('Panel del titular')).not.toBeInTheDocument();
    unmount();

    mocked.mockResolvedValue(ownerGroup);
    render(<GroupDetailView groupId={ownerGroup.id} ownerPanel={ownerPanel} />);
    expect(await screen.findByText('Panel del titular')).toBeVisible();
    expect(ownerPanel).toHaveBeenCalledWith(ownerGroup, { onGroupChange: expect.any(Function) });
  });

  it('un 401 redirige a /ingresar', async () => {
    mocked.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    render(<GroupDetailView groupId="abc" />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fgrupos%2Fabc'));
  });
});
