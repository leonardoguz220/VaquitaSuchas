import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/services/http';
import { getReminderShare } from '@/services/invitations';
import { ReminderWhatsApp } from './reminder-whatsapp';

jest.mock('@/services/invitations', () => ({ getReminderShare: jest.fn() }));

const mocked = jest.mocked(getReminderShare);

function fakeTab() {
  return { opener: {}, location: { href: '' }, close: jest.fn() } as unknown as Window;
}

beforeEach(() => mocked.mockReset());
afterEach(() => jest.restoreAllMocks());

describe('ReminderWhatsApp en /cobros/[id] (spec 005 T028)', () => {
  it('CA-005-18: abre wa.me dirigido al celular del miembro con el texto del cobro', async () => {
    mocked.mockResolvedValue({ phone: '+59171234567', text: 'Tu cuota: Bs 12,40' });
    const tab = fakeTab();
    jest.spyOn(window, 'open').mockReturnValue(tab);
    const user = userEvent.setup();
    render(<ReminderWhatsApp chargeId="c1" />);
    await user.click(screen.getByRole('button', { name: 'Recordar por WhatsApp' }));
    expect(mocked).toHaveBeenCalledWith('c1');
    expect(tab.location.href).toBe('https://wa.me/59171234567?text=Tu+cuota%3A+Bs+12%2C40');
    expect(tab.opener).toBeNull();
  });

  it('RF-005-16: un cobro que no se puede recordar cierra la pestaña y lo explica', async () => {
    mocked.mockRejectedValue(
      new ApiError(422, 'BUSINESS_RULE', 'x', { code: 'CHARGE_NOT_COLLECTABLE' }),
    );
    const tab = fakeTab();
    jest.spyOn(window, 'open').mockReturnValue(tab);
    const user = userEvent.setup();
    render(<ReminderWhatsApp chargeId="c1" />);
    await user.click(screen.getByRole('button', { name: 'Recordar por WhatsApp' }));
    expect(await screen.findByText(/ya no se puede recordar/)).toBeVisible();
    expect(tab.close).toHaveBeenCalled();
  });
});
