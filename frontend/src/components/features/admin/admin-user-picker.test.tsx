import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { listAdminUsers } from '@/services/admin';
import { AdminUserPicker } from './admin-user-picker';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/titulares',
}));
jest.mock('@/services/admin', () => ({ listAdminUsers: jest.fn() }));

const listMock = listAdminUsers as jest.MockedFunction<typeof listAdminUsers>;
const EMPTY_MESSAGE = 'No encontramos a nadie con esa búsqueda.';

describe('AdminUserPicker (QA-03)', () => {
  beforeEach(() => {
    listMock.mockReset();
    listMock.mockResolvedValue({ items: [], nextCursor: null });
  });

  it('no dice «No encontramos a nadie» antes de buscar ni con una sola letra', async () => {
    render(<AdminUserPicker selected={null} onSelect={jest.fn()} />);
    expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Buscar persona/), 'a');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
    expect(listMock).not.toHaveBeenCalled();
  });

  it('lo dice solo cuando una búsqueda de 2 letras o más no encuentra a nadie', async () => {
    render(<AdminUserPicker selected={null} onSelect={jest.fn()} />);
    await userEvent.type(screen.getByLabelText(/Buscar persona/), 'zz');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText(EMPTY_MESSAGE)).toBeInTheDocument();
  });
});
