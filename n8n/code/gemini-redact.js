const base = $('Asistente BALTO · Preparar respuesta').first().json;
const context = $('Recibir consulta').first().json;
const conversational = ['identity', 'greeting', 'unknown', 'pet_care'].includes(base.body.intent);
const result = (ok, body = base.body) => [{json: {ok, resultado: {...base, body}}}];
const clinical = () => result(true, {
  ...base.body,
  intent: 'clinical',
  reply: 'Escríbanos o llámenos para coordinar una evaluación con nuestro equipo veterinario de BALTO. Si observa señales de urgencia, busque atención de inmediato en el centro veterinario más cercano.',
});

try {
  const raw = $input.first()?.json;
  const candidate = raw?.candidates?.[0];
  if (raw?.error || candidate?.finishReason !== 'STOP') return result(false);
  const {tipo, texto} = JSON.parse(candidate.content.parts.map(part => part.text || '').join(''));
  if (tipo === 'clinica' && texto === '') {
    // Solo se acepta «clínica» si la pregunta menciona síntomas o medicación; si no, se usa la respuesta de Drupal.
    const asked = String(context.message || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const illness = /\b(?:sintomas?|enferm\w*|vomit\w*|diarrea|tos|fiebre|herid\w*|dolor\w*|sangr\w*|cojea|cojo|medicin\w*|dosis|tratamiento|pastillas?|jarabe|inyecci\w*|malestar|decaid\w*|veneno|intoxic\w*|convuls\w*|infecci\w*|alergia|parasit\w*|pulgas?|garrapatas?|no (?:quiere )?com\w*|no respira)\b/.test(asked);
    return illness ? clinical() : result(false);
  }
  if (!conversational) {
    // Modo datos: Gemini redacta, pero toda cifra de 3 o más dígitos debe existir en los datos verificados.
    if (tipo !== 'respuesta' || typeof texto !== 'string') return result(false);
    const answer = texto.trim();
    if (answer.length < 8 || answer.length > 700 || /[<>]|https?:|www\./i.test(answer)) return result(false);
    const facts = String(base.facts || '') + '\n' + base.body.reply;
    const digits = value => value.replace(/\s+/g, '');
    const known = digits(facts);
    const invented = (answer.match(/\d[\d.,:]*\d|\d/g) || []).some(n => n.replace(/\D/g, '').length >= 3 && !known.includes(digits(n)));
    if (invented) return result(false);
    // El chat no reserva ni guarda productos: si Gemini lo ofrece, se usa el texto de Drupal.
    if (/\b(?:te (?:lo |la |los |las )?(?:guardo|reservo|separo|aparto|guardemos|reservemos|separemos|apartemos)|(?:guardar|reservar|separar|apartar)(?:te|tela|telo)|(?:guardemos|reservemos|apartemos))\b/i.test(answer)) return result(false);
    const normalizedAnswer = answer.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/\b(?:dosis|receta|administrale|medica|ibuprofeno|paracetamol|miligramos)\b/.test(normalizedAnswer)) return result(false);
    return result(true, {...base.body, reply: answer});
  }

  if (tipo !== 'respuesta' || typeof texto !== 'string') return result(false);
  const text = texto.trim();
  if (text.length < 8 || text.length > 900 || /[<>]|https?:|www\./i.test(text)) return result(false);
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // En cuidados se permite «dosis de vacuna»; nunca cantidades ni fármacos.
  const banned = base.body.intent === 'pet_care'
    ? /\b(?:receta|administrale|ibuprofeno|paracetamol|miligramos)\b|\d\s*(?:mg|ml)\b/
    : /\b(?:dosis|receta|administrale|medica|ibuprofeno|paracetamol|miligramos)\b|\d\s*(?:mg|ml)\b/;
  if (banned.test(normalized)) return result(false);
  // Sin precios nunca; en cuidados se permiten cifras orientativas (semanas, meses) junto a «BALTO».
  if (/s\/\s*\d/i.test(text)) return result(false);
  if (base.body.intent !== 'pet_care' && /\b(?:balto|tienda|consultorio)\b[^.!?\n]*\d/i.test(text)) return result(false);
  if (base.body.intent === 'identity' && !context.asksCapabilities && !/balto/i.test(text)) return result(false);
  return result(true, {...base.body, reply: text});
} catch {
  return result(false);
}
