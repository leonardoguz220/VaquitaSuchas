import { pendingCharge } from './__fixtures__/charges';
import { getCharge, listMyCharges, uploadReceipt } from './charges';
import { apiRequest } from './http';

jest.mock('./http', () => ({
  ...jest.requireActual('./http'),
  apiRequest: jest.fn(),
}));

const mockedRequest = jest.mocked(apiRequest);

beforeEach(() => mockedRequest.mockReset());

describe('services/charges (contrato 002): lectura', () => {
  it('RF-002-15: listMyCharges hace GET /api/me/charges sin filtros', async () => {
    const page = { items: [], nextCursor: null };
    mockedRequest.mockResolvedValue(page);
    await expect(listMyCharges()).resolves.toBe(page);
    expect(mockedRequest).toHaveBeenCalledWith('/api/me/charges');
  });

  it('RF-002-15: listMyCharges manda estado, período, grupo, límite y cursor en la query', async () => {
    mockedRequest.mockResolvedValue({ items: [], nextCursor: null });
    await listMyCharges({
      status: 'atrasado',
      period: '2026-10',
      groupId: 'g2',
      limit: 20,
      cursor: 'abc',
    });
    expect(mockedRequest).toHaveBeenCalledWith(
      '/api/me/charges?status=atrasado&period=2026-10&groupId=g2&limit=20&cursor=abc',
    );
  });

  it('CA-002-23: getCharge hace GET /api/charges/:id con el id codificado', async () => {
    mockedRequest.mockResolvedValue(pendingCharge);
    await expect(getCharge('c/1')).resolves.toBe(pendingCharge);
    expect(mockedRequest).toHaveBeenCalledWith('/api/charges/c%2F1');
  });
});

describe('services/charges (contrato 002): comprobante', () => {
  it('CA-002-04: uploadReceipt hace POST multipart con archivo, método, referencia y versión', async () => {
    mockedRequest.mockResolvedValue(pendingCharge);
    const file = new File(['x'], 'pago.jpg', { type: 'image/jpeg' });
    await uploadReceipt('c1', { file, method: 'qr', reference: 'TRF-1', version: 3 });
    const [path, options] = mockedRequest.mock.calls[0];
    expect(path).toBe('/api/charges/c1/receipts');
    expect(options?.method).toBe('POST');
    const form = options?.formData as FormData;
    expect(form.get('file')).toBe(file);
    expect(form.get('method')).toBe('qr');
    expect(form.get('reference')).toBe('TRF-1');
    expect(form.get('version')).toBe('3');
  });

  it('CA-002-26: uploadReceipt no inventa campos que no vienen', async () => {
    mockedRequest.mockResolvedValue(pendingCharge);
    const file = new File(['x'], 'pago.pdf', { type: 'application/pdf' });
    await uploadReceipt('c1', { file, method: 'transferencia', reference: 'A' });
    const form = mockedRequest.mock.calls[0][1]?.formData as FormData;
    expect(form.has('version')).toBe(false);
  });
});
