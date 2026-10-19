import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { adminDisputeEvidence, adminDisputeRow } from '@/services/__fixtures__/admin';
import { getAdminDisputeEvidence, resolveAdminDispute } from '@/services/admin-disputes';
import { ApiError } from '@/services/http';
import AdminDisputePage, { metadata } from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/reclamos/d1',
}));
jest.mock('@/services/admin-disputes', () => ({
  ...jest.requireActual('@/services/admin-disputes'),
  getAdminDisputeEvidence: jest.fn(),
  resolveAdminDispute: jest.fn(),
}));

const mockedEvidence = jest.mocked(getAdminDisputeEvidence);
const mockedResolve = jest.mocked(resolveAdminDispute);

const REASON = 'El banco confirma el pago y el titular no respondió.';

async function renderPage(id = 'd1') {
  const ui = await AdminDisputePage({ params: Promise.resolve({ id }) });
  const user = userEvent.setup();
  render(ui);
  return user;
}

async function openEvidence(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Ver evidencia' }));
  await screen.findByRole('heading', { level: 2, name: 'Pago sin ingreso · Crunchyroll anime' });
}

function dialog() {
  return screen.getByRole('dialog');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedEvidence.mockResolvedValue(adminDisputeEvidence());
  mockedResolve.mockResolvedValue({});
});

describe('/admin/reclamos/[id] (spec 009 T024)', () => {
  it('CA-009-27: la evidencia no se pide al abrir la pantalla y se avisa que la apertura queda registrada', async () => {
    expect(metadata.title).toBe('Reclamo');
    await renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Reclamo' })).toBeVisible();
    expect(
      screen.getByText(
        'Ver la evidencia abre el chat y el comprobante privados. Esta apertura queda registrada en auditoría.',
      ),
    ).toBeVisible();
    expect(mockedEvidence).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Volver a reclamos' })).toHaveAttribute(
      'href',
      '/admin/reclamos',
    );
  });

  it('CA-009-27: «Ver evidencia» muestra línea de tiempo, chat de solo lectura y comprobante', async () => {
    const user = await renderPage();
    await openEvidence(user);
    expect(mockedEvidence).toHaveBeenCalledTimes(1);
    expect(mockedEvidence).toHaveBeenCalledWith('d1');
    expect(
      screen.getByText('Abriste la evidencia. Esta apertura quedó registrada en auditoría.'),
    ).toBeVisible();
    expect(
      screen.getByText(
        /Abrió Ana Quispe \(solicitante\) contra Kevin Rojas \(titular\) · 17 oct 2026, 09:12 · Cuota cotizada Bs 12,00 · Ref\. TRF-554210/,
      ),
    ).toBeVisible();
    const chat = screen.getByRole('list', { name: 'Mensajes del chat' });
    expect(chat).toHaveTextContent('Ana Quispe · 15 oct 2026, 19:41');
    expect(chat).toHaveTextContent('Hola, ¿tienes cupo en Crunchyroll?');
    expect(within(chat).getByRole('link', { name: /Ver imagen/ })).toHaveAttribute(
      'href',
      'https://files.example.com/qr.png?sig=abc',
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const proof = screen.getByRole('region', { name: 'Comprobante de ingreso' });
    expect(proof).toHaveTextContent('TRF-554210');
    const proofLink = within(proof).getByRole('link', { name: /Abrir comprobante/ });
    expect(proofLink).toHaveAttribute('href', 'https://files.example.com/proof.png?sig=xyz');
    expect(proofLink).toHaveAttribute('target', '_blank');
    expect(proofLink).toHaveAttribute('rel', 'noopener noreferrer');
    const claims = screen.getByRole('region', { name: 'Descripciones y respuestas' });
    expect(claims).toHaveTextContent('Pago sin ingreso: Ana Quispe');
    expect(claims).toHaveTextContent('No vi el aviso a tiempo.');
    expect(
      screen.getByRole('list', { name: 'Línea de tiempo de la solicitud' }),
    ).toBeInTheDocument();
  });

  it('RF-009-20: el contenido de las personas se muestra como texto y no se abren URLs peligrosas', async () => {
    mockedEvidence.mockResolvedValue(
      adminDisputeEvidence({
        messages: [
          {
            id: 'm9',
            seq: 9,
            sender: { userId: 'u2', fullName: 'Ana Quispe' },
            body: '<img src=x onerror=alert(1)> hola',
            imageUrl: 'javascript:alert(1)',
            createdAt: '2026-10-15T23:41:00.000Z',
          },
        ],
      }),
    );
    const user = await renderPage();
    await openEvidence(user);
    expect(screen.getByText('<img src=x onerror=alert(1)> hola')).toBeVisible();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Ver imagen: archivo no disponible')).toBeVisible();
  });

  it('CA-009-27: sin reclamo abierto la API responde 403 y se explica', async () => {
    mockedEvidence.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Ver evidencia' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No puedes ver esta evidencia: el reclamo ya no está abierto o tu cuenta no es administradora.',
    );
    expect(screen.getByRole('link', { name: 'Ir a mi panel' })).toHaveAttribute('href', '/panel');
  });

  it('RF-009-20: un error de conexión permite intentarlo de nuevo', async () => {
    mockedEvidence.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'));
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Ver evidencia' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo contactar con el servidor.',
    );
    await user.click(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    await screen.findByRole('heading', { level: 2, name: 'Pago sin ingreso · Crunchyroll anime' });
  });

  it('CA-009-25: resolver como estafa confirmada avisa a quién se banea y envía resultado y motivo', async () => {
    const user = await renderPage();
    await openEvidence(user);
    await user.click(screen.getByRole('button', { name: 'Resolver reclamo' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Resolver reclamo' }));
    expect(within(dialog()).getByText('Elige un resultado.')).toBeVisible();
    await user.click(within(dialog()).getByRole('radio', { name: /Estafa confirmada/ }));
    expect(dialog()).toHaveTextContent(
      'Se banea a Kevin Rojas (titular) y se bloquean su correo, su celular, su CI y su cuenta de Telegram. Sus grupos quedan en solo lectura.',
    );
    expect(within(dialog()).getByRole('textbox')).toHaveAccessibleName(
      'Motivo (de 10 a 300 caracteres, lo verán ambas partes)',
    );
    await user.type(within(dialog()).getByRole('textbox'), REASON);
    await user.click(within(dialog()).getByRole('button', { name: 'Confirmar estafa y banear' }));
    expect(mockedResolve).toHaveBeenCalledWith('d1', {
      result: 'estafa_confirmada',
      reason: REASON,
    });
    expect(await screen.findByText(/Resolviste el reclamo como «Estafa confirmada»/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Resolver reclamo' })).not.toBeInTheDocument();
    expect(mockedEvidence).toHaveBeenCalledTimes(1);
  });

  it('CA-009-30: en un comprobante falso la persona acusada es el solicitante', async () => {
    mockedEvidence.mockResolvedValue(
      adminDisputeEvidence({
        dispute: adminDisputeRow({
          kind: 'comprobante_falso',
          openedBy: { userId: 'u7', fullName: 'Kevin Rojas', role: 'titular' },
          accused: { userId: 'u2', fullName: 'Ana Quispe', role: 'solicitante' },
        }),
      }),
    );
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Ver evidencia' }));
    await user.click(await screen.findByRole('button', { name: 'Resolver reclamo' }));
    expect(dialog()).toHaveTextContent('Se banea a Ana Quispe (solicitante)');
    expect(dialog()).not.toHaveTextContent('Sus grupos quedan en solo lectura.');
  });

  it('CA-009-26: resolver sin falta envía «sin_falta» con el motivo', async () => {
    const user = await renderPage();
    await openEvidence(user);
    await user.click(screen.getByRole('button', { name: 'Resolver reclamo' }));
    await user.click(within(dialog()).getByRole('radio', { name: /Sin falta/ }));
    expect(dialog()).toHaveTextContent('No se sanciona a nadie.');
    await user.type(within(dialog()).getByRole('textbox'), REASON);
    await user.click(within(dialog()).getByRole('button', { name: 'Resolver sin falta' }));
    expect(mockedResolve).toHaveBeenCalledWith('d1', { result: 'sin_falta', reason: REASON });
    expect(await screen.findByText(/Resolviste el reclamo como «Sin falta»/)).toBeVisible();
  });

  it('RF-009-20: un reclamo ya resuelto (409) no cambia nada y se avisa', async () => {
    mockedResolve.mockRejectedValue(new ApiError(409, 'DISPUTE_NOT_OPEN', 'x'));
    const user = await renderPage();
    await openEvidence(user);
    await user.click(screen.getByRole('button', { name: 'Resolver reclamo' }));
    await user.click(within(dialog()).getByRole('radio', { name: /Sin falta/ }));
    await user.type(within(dialog()).getByRole('textbox'), REASON);
    await user.click(within(dialog()).getByRole('button', { name: 'Resolver sin falta' }));
    expect(
      await screen.findByText('El reclamo ya estaba resuelto. No se cambió nada.'),
    ).toBeVisible();
  });

  it('RF-009-20: un reclamo resuelto no ofrece resolver', async () => {
    mockedEvidence.mockResolvedValue(
      adminDisputeEvidence({
        dispute: adminDisputeRow({ status: 'resuelto', result: 'sin_falta' }),
        proof: null,
        messages: [],
      }),
    );
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Ver evidencia' }));
    expect(await screen.findByText(/Este reclamo ya está resuelto como «Sin falta»/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Resolver reclamo' })).not.toBeInTheDocument();
    expect(screen.getByText('No hay comprobante en esta solicitud.')).toBeVisible();
    expect(screen.getByText(/El chat no tiene mensajes/)).toBeVisible();
  });
});
