// Este proceso se ejecuta antes de n8n. Ningún secreto se añade al workflow.
const fs = require('node:fs');
const crypto = require('node:crypto');
// CHAT_ALLOWED_ORIGIN admite varios orígenes separados por coma (p. ej. IP y localhost).
const origins = [...new Set((process.env.CHAT_ALLOWED_ORIGIN || '').split(',').map(v => v.trim()).filter(Boolean).map(v => new URL(v).origin))];
if (!origins.length) throw new Error('Falta CHAT_ALLOWED_ORIGIN, por ejemplo http://IP:8080');
const base = new URL(process.env.DRUPAL_BASE_URL).origin;
const workflow = JSON.parse(fs.readFileSync('/workflows/chatbot.json', 'utf8'));
const dataWorkflow = JSON.parse(fs.readFileSync('/workflows/chat-datos.json', 'utf8'));
const node = (name, flow = workflow) => {
  const found = flow.nodes.find(n => n.name === name);
  if (!found) throw new Error(`Falta el nodo «${name}» en ${flow.name}`);
  return found;
};
const setConst = (name, pattern, value, flow) => {
  const params = node(name, flow).parameters;
  if (!pattern.test(params.jsCode)) throw new Error(`No se pudo adaptar la URL del nodo «${name}»`);
  params.jsCode = params.jsCode.replace(pattern, value);
};
node('Recibir chat').parameters.options.allowedOrigins = origins.join(',');
setConst('¿Qué pregunta el cliente?', /const allowedOrigins = \[[^\]\n]*\];/, `const allowedOrigins = ${JSON.stringify(origins)};`);
setConst('Asistente BALTO · Preparar respuesta', /const publicBase = '[^'\n]*';/, `const publicBase = ${JSON.stringify(base)};`, dataWorkflow);
const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
const geminiEnabled = process.env.GEMINI_ENABLED === 'true' && !!geminiKey;
const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const model2 = (process.env.GEMINI_MODEL_2 || '').trim() || model;
const model3 = (process.env.GEMINI_MODEL_3 || '').trim() || model;
const key2 = (process.env.GEMINI_API_KEY_2 || '').trim() || geminiKey;
const key3 = (process.env.GEMINI_API_KEY_3 || '').trim() || geminiKey;
for (const value of [model, model2, model3]) if (!/^[a-z0-9.-]+$/.test(value)) throw new Error('Modelo Gemini inválido');
if (geminiEnabled) {
  const primary = ['Gemini principal', '¿IA 1 respondió?', model, geminiKey];
  const backups = [
    ['Gemini de respaldo', '¿IA 2 respondió?', model2, key2],
    ['Respaldo IA 3', null, model3, key3],
  ];
  const chain = [primary];
  for (const backup of backups) {
    if (!chain.some(item => item[2] === backup[2] && item[3] === backup[3])) chain.push(backup);
  }
  const route = name => [{ node: name, type: 'main', index: 0 }];
  const review = route('Revisar qué pide el cliente');
  const retained = new Set();
  for (const [index, [name, check, value]] of chain.entries()) {
    retained.add(name);
    node(name).parameters.modelId.value = `models/${value}`;
    const next = chain[index + 1];
    workflow.connections[name] = {main: [next ? route(check) : review]};
    if (next) {
      retained.add(check);
      workflow.connections[check] = {main: [review, route(next[0])]};
    }
  }
  const unused = new Set([primary, ...backups].flatMap(([name, check]) => check ? [name, check] : [name]).filter(name => !retained.has(name)));
  workflow.nodes = workflow.nodes.filter(node => !unused.has(node.name));
  for (const name of unused) delete workflow.connections[name];
} else {
  const optionalNodes = [
    '¿Hace falta Gemini?', 'Gemini principal', '¿IA 1 respondió?', 'Gemini de respaldo', '¿IA 2 respondió?', 'Respaldo IA 3',
    'Buscar producto inicial',
  ];
  workflow.nodes = workflow.nodes.filter(node => !optionalNodes.includes(node.name));
  const review = workflow.connections['¿Hace falta Gemini?'].main[1];
  workflow.connections['Validar y dirigir'].main.splice(1, 2, review, review);
  for (const name of optionalNodes) delete workflow.connections[name];

  const positions = {
    'Entrada': [-10, 0],
    'Interpretación': [475, 0],
    'Datos de Drupal': [700, 0],
    'Recibir chat': [40, 310],
    '¿Qué pregunta el cliente?': [220, 310],
    'Validar y dirigir': [400, 310],
    'Revisar qué pide el cliente': [580, 310],
    'Consultar Drupal y preparar respuesta': [790, 310],
    'Enviar respuesta': [1010, 310],
  };
  workflow.nodes.find(node => node.name === 'Interpretación').parameters.content =
    '## 2. ¿Qué quiere saber?';
  const widths = {'Entrada': 465, 'Interpretación': 205, 'Datos de Drupal': 390};
  for (const node of workflow.nodes) {
    node.position = positions[node.name] ?? node.position;
    if (widths[node.name]) node.parameters.width = widths[node.name];
  }
}
const serialized = JSON.stringify(workflow);
const serializedData = JSON.stringify(dataWorkflow);
fs.writeFileSync('/tmp/balto-chat-datos.json', serializedData, { mode: 0o600 });
fs.writeFileSync('/tmp/balto-chatbot.json', serialized, { mode: 0o600 });
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
fs.writeFileSync('/tmp/balto-pedidos.json', orders, { mode: 0o600 });
fs.writeFileSync('/tmp/balto-bot.json', bot, { mode: 0o600 });
fs.writeFileSync('/tmp/balto-orders-enabled', ordersEnabled ? '1' : '0', { mode: 0o600 });
fs.writeFileSync('/tmp/balto-bot-enabled', botEnabled ? '1' : '0', { mode: 0o600 });
fs.writeFileSync('/tmp/balto-workflow.sha256', crypto.createHash('sha256').update(serialized + serializedData + orders + bot + ordersEnabled + botEnabled + (process.env.WEBHOOK_URL || '')).digest('hex'));
const key = process.env.VET_API_KEY;
if (!key || key.length < 32) throw new Error('Falta configurar VET_API_KEY.');
const credentials = [{ id: 'baltoDrupalApi', name: 'BALTO API interna', type: 'httpHeaderAuth', data: { name: 'X-API-KEY', value: key } }];
for (const [id, name, value] of [['baltoGeminiApi', 'BALTO Gemini', geminiKey], ['baltoGeminiApi2', 'BALTO Gemini 2', key2], ['baltoGeminiApi3', 'BALTO Gemini 3', key3]]) {
  credentials.push({id, name, type: 'googlePalmApi', data: {host: 'https://generativelanguage.googleapis.com', apiKey: geminiEnabled ? value : 'disabled'}});
}
credentials.push({ id: 'baltoPedidoSecret', name: 'BALTO secreto de pedidos', type: 'httpHeaderAuth', data: { name: 'X-Balto-Secret', value: ordersEnabled ? orderSecret : crypto.randomBytes(32).toString('hex') } });
credentials.push({ id: 'baltoTelegram', name: 'BALTO Telegram', type: 'telegramApi', data: { accessToken: telegramToken || 'disabled', baseUrl: 'https://api.telegram.org' } });
fs.writeFileSync('/tmp/balto-credentials.json', JSON.stringify(credentials), {mode: 0o600});
