// Este proceso se ejecuta antes de n8n. Ningún secreto se añade al workflow.
const fs = require('node:fs');
const crypto = require('node:crypto');
const origin = new URL(process.env.CHAT_ALLOWED_ORIGIN).origin;
const base = new URL(process.env.DRUPAL_BASE_URL).origin;
const orderSecret = (process.env.BALTO_N8N_SECRET || '').trim();
const telegramToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const telegramChat = (process.env.TELEGRAM_CHAT_ID || '').trim();
if (telegramChat && !/^-?\d+$/.test(telegramChat)) throw new Error('TELEGRAM_CHAT_ID inválido');
const stockThreshold = Number.parseInt(process.env.STOCK_ALERT_THRESHOLD || '5', 10);
if (!Number.isInteger(stockThreshold) || stockThreshold < 0 || stockThreshold > 100000) throw new Error('STOCK_ALERT_THRESHOLD inválido');
const ordersEnabled = orderSecret.length >= 32 && !!telegramToken && !!telegramChat;
// El Telegram Trigger solo funciona con una URL pública HTTPS.
const botEnabled = ordersEnabled && /^https:\/\//.test(process.env.WEBHOOK_URL || '');
const fill = f => fs.readFileSync(f, 'utf8')
  .replaceAll('__TELEGRAM_CHAT_ID__', telegramChat || '0')
  .replaceAll('__STOCK_THRESHOLD__', String(stockThreshold))
  .replaceAll('__TELEGRAM_PAYMENT_BUTTON__', botEnabled ? 'enabled' : 'disabled');
const orders = fill('/workflows/pedidos.json');
const bot = fill('/workflows/bot.json');
const chatFill = f => fill(f).replaceAll('__CHAT_ORIGIN__', origin).replaceAll('__DRUPAL_BASE__', base);
// Chat web: tres workflows (entrada, datos y aviso de errores). Gemini se llama por HTTP con límite de tiempo;
// si la clave no está o falla, el chat responde con reglas.
const chatbot = chatFill('/workflows/chatbot.json');
const chatData = chatFill('/workflows/datos-chat.json');
const chatErrors = chatFill('/workflows/errores-chat.json');
for (const text of [chatbot, chatData, chatErrors]) JSON.parse(text);
fs.writeFileSync('/tmp/balto-chatbot.json', chatbot, { mode: 0o600 });
fs.writeFileSync('/tmp/balto-datos-chat.json', chatData, { mode: 0o600 });
fs.writeFileSync('/tmp/balto-errores-chat.json', chatErrors, { mode: 0o600 });
const serialized = chatbot + chatData + chatErrors;
fs.writeFileSync('/tmp/balto-pedidos.json', orders, { mode: 0o600 });
fs.writeFileSync('/tmp/balto-bot.json', bot, { mode: 0o600 });
fs.writeFileSync('/tmp/balto-orders-enabled', ordersEnabled ? '1' : '0', { mode: 0o600 });
fs.writeFileSync('/tmp/balto-bot-enabled', botEnabled ? '1' : '0', { mode: 0o600 });
fs.writeFileSync('/tmp/balto-workflow.sha256', crypto.createHash('sha256').update(serialized + orders + bot + ordersEnabled + botEnabled + (process.env.WEBHOOK_URL || '')).digest('hex'));
const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
const geminiKey2 = (process.env.GEMINI_API_KEY_2 || '').trim() || geminiKey;
const geminiEnabled = process.env.GEMINI_ENABLED === 'true' && !!geminiKey;
const key = process.env.VET_API_KEY;
if (!key || key.length < 32) throw new Error('Falta configurar VET_API_KEY.');
const credentials = [{ id: 'baltoDrupalApi', name: 'BALTO API interna', type: 'httpHeaderAuth', data: { name: 'X-API-KEY', value: key } }];
credentials.push({id: 'baltoGeminiApi', name: 'BALTO Gemini', type: 'googlePalmApi', data: {host: 'https://generativelanguage.googleapis.com', apiKey: geminiEnabled ? geminiKey : 'disabled'}});
credentials.push({id: 'baltoGeminiApi2', name: 'BALTO Gemini respaldo', type: 'googlePalmApi', data: {host: 'https://generativelanguage.googleapis.com', apiKey: geminiEnabled ? geminiKey2 : 'disabled'}});
credentials.push({ id: 'baltoPedidoSecret', name: 'BALTO secreto de pedidos', type: 'httpHeaderAuth', data: { name: 'X-Balto-Secret', value: ordersEnabled ? orderSecret : crypto.randomBytes(32).toString('hex') } });
credentials.push({ id: 'baltoTelegram', name: 'BALTO Telegram', type: 'telegramApi', data: { accessToken: telegramToken || 'disabled', baseUrl: 'https://api.telegram.org' } });
fs.writeFileSync('/tmp/balto-credentials.json', JSON.stringify(credentials), {mode: 0o600});
