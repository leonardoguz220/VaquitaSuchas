import { paymentQrKeyOf, proofKeyOf } from './request-files.js';

const ids = { groupId: 'g1', requestId: 'r1', fileId: 'f1' };

describe('claves de archivos de la solicitud', () => {
  it('RNF-010-02: las claves las genera el servidor, sin nombres de archivo', () => {
    expect(proofKeyOf({ ...ids, type: 'pdf' })).toBe('join-requests/g1/r1/proof-f1.pdf');
    expect(paymentQrKeyOf({ ...ids, type: 'jpeg' })).toBe('join-requests/g1/r1/qr-f1.jpg');
    expect(paymentQrKeyOf({ ...ids, type: 'png' })).toBe('join-requests/g1/r1/qr-f1.png');
  });
});
