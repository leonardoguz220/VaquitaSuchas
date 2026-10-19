import { saveBlob } from './download';

describe('saveBlob (spec 006 T026)', () => {
  const createObjectURL = jest.fn(() => 'blob:vaquita/1');
  const revokeObjectURL = jest.fn();

  beforeAll(() => {
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });

  beforeEach(() => {
    jest.useFakeTimers();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  afterEach(() => jest.useRealTimers());

  it('RF-006-14: descarga el archivo con el nombre del servidor y libera la URL', () => {
    const clicked: Array<{ href: string; download: string }> = [];
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ href: this.href, download: this.download });
    });
    const blob = new Blob(['a,b\n'], { type: 'text/csv' });
    saveBlob(blob, 'vaquita-historial-2026-10-19.csv');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).toEqual([
      { href: 'blob:vaquita/1', download: 'vaquita-historial-2026-10-19.csv' },
    ]);
    expect(document.querySelector('a[download]')).toBeNull();
    jest.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:vaquita/1');
    click.mockRestore();
  });
});
