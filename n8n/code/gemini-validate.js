// La IA solo puede seleccionar consultas de lectura predefinidas.
const fallback = $('¿Qué pregunta el cliente?').first().json;
let context = {...fallback, engine: 'rules'};
if (fallback.status === 200) {
  try {
    const response = $input.first().json;
    if (response.candidates?.[0]?.finishReason !== 'STOP') throw new Error('Respuesta incompleta');
    const value = JSON.parse(response.candidates[0].content.parts.map(p => p.text || '').join(''));
    const intents = ['product','catalog','category','categories','services','schedule','payments','service_prices','overview','identity','capabilities','appointment','delivery','purchase','shopping_advice','promotions','greeting','clinical','unknown','pet_care','off_topic','assistant_ai','assistant_limits','assistant_privacy','assistant_creator'];
    if (!intents.includes(value.intent) || typeof value.q !== 'string' || value.q.length > 100) throw new Error('Formato no válido');
    const q = value.q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, ' ').replace(/\b\d+(?:[.,]\d+)?\s*(?:kilogramos?|kilos?|kg|gramos?|gr|g|ml|litros?|l)\b/g, ' ').replace(/\bde\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (value.intent === 'product' && !q) throw new Error('Falta producto');
    const asksCapabilities = value.intent === 'capabilities';
    context = {
      ...fallback, // Gemini a veces responde «catalog» aunque el cliente nombre su mascota: las reglas detectan la especie.
      intent: asksCapabilities ? 'identity' : (value.intent === 'catalog' && fallback.species ? 'category'
        // Gemini a veces marca «clinical» sin que haya síntomas: sin indicios de enfermedad se conserva lo que dedujeron las reglas.
        : value.intent === 'clinical' && !/\b(?:sintomas?|enferm\w*|vomit\w*|diarrea|tos|fiebre|herid\w*|dolor\w*|sangr\w*|cojea|cojo|medicin\w*|dosis|tratamiento|pastillas?|jarabe|inyecci\w*|malestar|decaid\w*|veneno|intoxic\w*|convuls\w*|infecci\w*|alergia|parasit\w*|pulgas?|garrapatas?)\b/.test(fallback.text) ? (fallback.species ? 'category' : fallback.intent)
        : value.intent),
      asksCapabilities, q, text: fallback.text + ' ' + q, engine: 'gemini',
    };
  } catch { /* Timeout, cuota o JSON inválido: conservar reglas existentes. */ }
}
if (context.intent === 'product' && context.q === fallback.q) {
  try {
    const search = $('Buscar producto inicial');
    if (search.isExecuted) context.initialProduct = search.first().json;
  } catch { /* El nodo puede estar deshabilitado en la configuración sin IA. */ }
}
if (fallback.secondaryQuestion) {
  const { secondaryQuestion, ...first } = context;
  return [{json: first}, {json: secondaryQuestion}];
}
return [{json: context}];
