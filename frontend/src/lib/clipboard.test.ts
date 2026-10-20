import { copyText } from './clipboard';

const original = navigator.clipboard;

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

afterEach(() => setClipboard(original));

describe('copyText (spec 010)', () => {
  it('RF-010-11: copia con la API del portapapeles', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    await expect(copyText('21,00')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('21,00');
  });

  it('RF-010-11: devuelve false sin portapapeles o si falla', async () => {
    setClipboard(undefined);
    await expect(copyText('x')).resolves.toBe(false);
    setClipboard({ writeText: jest.fn().mockRejectedValue(new Error('no')) });
    await expect(copyText('x')).resolves.toBe(false);
  });
});
