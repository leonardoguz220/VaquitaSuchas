import { buildSimulatedUpdate, parseUpdate } from './telegram-update.js';

describe('parseUpdate', () => {
  it('CA-000-17: reconoce /start con token', () => {
    const raw = buildSimulatedUpdate({ kind: 'start', telegramUserId: 7, token: 'abc123' }, 10);
    expect(parseUpdate(raw)).toEqual({
      updateId: 10,
      telegramUserId: 7,
      chatId: 7,
      command: { type: 'start', token: 'abc123' },
    });
  });

  it('CA-000-17: reconoce el contacto compartido', () => {
    const raw = buildSimulatedUpdate(
      { kind: 'contact', telegramUserId: 7, phoneNumber: '+59171234567', contactUserId: 7 },
      11,
    );
    expect(parseUpdate(raw)?.command).toEqual({
      type: 'contact',
      phoneNumber: '+59171234567',
      contactUserId: 7,
    });
  });

  it('/start sin token y con mención del bot', () => {
    expect(
      parseUpdate({ update_id: 1, message: { from: { id: 2 }, chat: { id: 2 }, text: '/start' } })
        ?.command,
    ).toEqual({ type: 'start' });
    expect(
      parseUpdate({
        update_id: 1,
        message: { from: { id: 2 }, chat: { id: 2 }, text: '/start@vaquita_bot tk' },
      })?.command,
    ).toEqual({ type: 'start', token: 'tk' });
  });

  it('un mensaje de texto cualquiera es de tipo other', () => {
    expect(
      parseUpdate({ update_id: 1, message: { from: { id: 2 }, chat: { id: 2 }, text: 'hola' } })
        ?.command,
    ).toEqual({ type: 'other' });
  });

  it('sin update_id entero positivo devuelve null', () => {
    expect(parseUpdate({})).toBeNull();
    expect(parseUpdate({ update_id: 'x' })).toBeNull();
    expect(parseUpdate(null)).toBeNull();
    expect(parseUpdate('texto')).toBeNull();
  });

  it('una actualización sin mensaje se ignora como other sin remitente', () => {
    expect(parseUpdate({ update_id: 5, edited_message: {} })).toEqual({
      updateId: 5,
      command: { type: 'other' },
    });
  });

  it('el contacto sin user_id queda sin contactUserId', () => {
    const parsed = parseUpdate({
      update_id: 3,
      message: { from: { id: 2 }, chat: { id: 2 }, contact: { phone_number: '71234567' } },
    });
    expect(parsed?.command).toEqual({ type: 'contact', phoneNumber: '71234567' });
  });

  it('CA-005-33: my_chat_member con estado kicked es bot bloqueado; member, desbloqueado', () => {
    const raw = (status: string) => ({
      update_id: 9,
      my_chat_member: { from: { id: 77 }, chat: { id: 77 }, new_chat_member: { status } },
    });
    expect(parseUpdate(raw('kicked'))).toEqual({
      updateId: 9,
      telegramUserId: 77,
      chatId: 77,
      command: { type: 'bot_status', blocked: true },
    });
    expect(parseUpdate(raw('member'))?.command).toEqual({ type: 'bot_status', blocked: false });
  });
});
