import { whatsAppUrl } from './whatsapp';

describe('whatsAppUrl (plan 005 §6)', () => {
  it('CA-005-17: sin número arma https://wa.me/?text= con el mensaje codificado', () => {
    expect(whatsAppUrl('Únete a «Spotify» en https://app/unirse?codigo=K7M2Q9XA')).toBe(
      'https://wa.me/?text=%C3%9Anete+a+%C2%ABSpotify%C2%BB+en+https%3A%2F%2Fapp%2Funirse%3Fcodigo%3DK7M2Q9XA',
    );
  });

  it('CA-005-18: con el celular del miembro usa solo los dígitos, sin el +', () => {
    expect(whatsAppUrl('Hola', '+591 71234567')).toBe('https://wa.me/59171234567?text=Hola');
  });
});
