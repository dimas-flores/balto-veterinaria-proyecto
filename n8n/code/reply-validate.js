// Ante errores o cifras nuevas, mostrar el texto original de Drupal.
const base = $('Responder en español').first().json;
let result = base;
try {
  const response = $input.first().json;
  if (response.candidates?.[0]?.finishReason !== 'STOP') throw new Error('Respuesta incompleta');
  const parsed = JSON.parse(response.candidates[0].content.parts.map(p => p.text || '').join(''));
  const reply = parsed.reply;
  if (typeof reply !== 'string' || !reply.trim() || reply.length > 1800 || /https?:|<[^>]+>/.test(reply)) throw new Error('Formato inválido');
  const numbers = text => text.match(/\d+(?:[.,:]\d+)*/g) || [];
  const known = new Set(numbers(base.body.reply));
  if (numbers(reply).some(n => !known.has(n))) throw new Error('Cifra no respaldada');
  // El aviso académico se conserva aunque el modelo lo omita.
  let text = reply.trim();
  if (base.body.reply.includes('Productos, precios y existencias de ejemplo') && !/ejemplo/i.test(text)) text += '\nProductos, precios y existencias de ejemplo.';
  result = {...base, body: {...base.body, reply: text, generated: true}};
} catch { /* Respaldo sin nuevas llamadas ni pérdida de botones. */ }
return [{json: result}];
