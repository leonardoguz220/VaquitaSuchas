import { InvalidMailMessageError, type MailMessage } from '../../ports/mail.service.js';
import { parseMailbox, validateMailMessage } from './mail-message.js';

const VALID: MailMessage = {
  to: 'ana@ejemplo.com',
  subject: 'Recuperación de contraseña',
  html: '<p>Hola</p>',
  text: 'Hola',
};

describe('validateMailMessage', () => {
  it('RF-000-12: acepta un mensaje completo', () => {
    expect(() => validateMailMessage(VALID)).not.toThrow();
  });

  it.each(['', 'sin-arroba', 'a@b', 'ana@ejemplo.com\r\nBcc: x@y.com', 'ana @ejemplo.com'])(
    'RF-000-12: rechaza la dirección «%s»',
    (to) => {
      expect(() => validateMailMessage({ ...VALID, to })).toThrow(InvalidMailMessageError);
    },
  );

  it.each(['', '   ', 'Asunto\r\nBcc: x@y.com', 'a'.repeat(201)])(
    'RF-000-12: rechaza el asunto %j',
    (subject) => {
      expect(() => validateMailMessage({ ...VALID, subject })).toThrow(InvalidMailMessageError);
    },
  );

  it('RF-000-12: exige cuerpo HTML y cuerpo de texto', () => {
    expect(() => validateMailMessage({ ...VALID, html: ' ' })).toThrow(InvalidMailMessageError);
    expect(() => validateMailMessage({ ...VALID, text: '' })).toThrow(InvalidMailMessageError);
  });

  it('RF-000-12: el error no repite la dirección recibida', () => {
    expect(() => validateMailMessage({ ...VALID, to: 'secreto-no-valido' })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('secreto-no-valido') }),
    );
  });
});

describe('parseMailbox', () => {
  it('RF-000-12: acepta una dirección sola', () => {
    expect(parseMailbox('no-reply@vaquita.app')).toEqual({ address: 'no-reply@vaquita.app' });
  });

  it('RF-000-12: acepta «Nombre <dirección>»', () => {
    expect(parseMailbox('Vaquita Suchas <no-reply@vaquita.app>')).toEqual({
      name: 'Vaquita Suchas',
      address: 'no-reply@vaquita.app',
    });
  });

  it.each(['', 'sin-arroba', 'Nombre <>', 'Nom"bre <a@b.com>', 'Nombre <a@b.com>\r\nBcc: x@y.com'])(
    'RF-000-12: devuelve null con %j',
    (value) => {
      expect(parseMailbox(value)).toBeNull();
    },
  );
});
