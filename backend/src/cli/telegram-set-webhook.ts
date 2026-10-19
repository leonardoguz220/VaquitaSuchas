import { HttpTelegramGateway } from '../modules/telegram/repositories/http-telegram.gateway.js';

// Registra el webhook en Telegram: `npm run telegram:set-webhook -w backend` (solo TELEGRAM_MODE=prod).
// Lee TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET y TELEGRAM_WEBHOOK_URL; no imprime ningún valor.
async function main(): Promise<void> {
  const {
    TELEGRAM_BOT_TOKEN: token,
    TELEGRAM_WEBHOOK_SECRET: secret,
    TELEGRAM_WEBHOOK_URL: url,
  } = process.env;
  const missing = Object.entries({
    TELEGRAM_BOT_TOKEN: token,
    TELEGRAM_WEBHOOK_SECRET: secret,
    TELEGRAM_WEBHOOK_URL: url,
  })
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);
  if (missing.length > 0 || !token || !secret || !url) {
    process.stderr.write(`Faltan variables: ${missing.join(', ')}\n`);
    process.exitCode = 1;
    return;
  }
  if (!url.startsWith('https://')) {
    process.stderr.write('TELEGRAM_WEBHOOK_URL debe empezar con https://\n');
    process.exitCode = 1;
    return;
  }
  await new HttpTelegramGateway(token).setWebhook(url, secret);
  process.stdout.write('Webhook de Telegram registrado.\n');
}

main().catch((error: Error) => {
  process.stderr.write(`${error.name}: ${error.message}\n`);
  process.exitCode = 1;
});
