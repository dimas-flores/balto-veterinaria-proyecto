// Clasificación inicial con reglas locales.
const input = $input.first().json;
const allowedOrigins = ['__BALTO_ORIGIN__']; // n8n-prepare.cjs pone aquí CHAT_ALLOWED_ORIGIN.
const origin = input.headers?.origin;
const message = input.body?.message;
const normalize = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
let status = 200;
if (origin && !allowedOrigins.includes(origin)) status = 403;
else if (typeof message !== 'string' || !message.trim() || message.length > 500) status = 400;
const text = status === 200 ? normalize(message.trim()) : '';
let intent = 'unknown';
const mentionsParasites = /\b(?:e?gar{2,}apat(?:as?)?|e?gar{2,}apast|pulgas?)\b/.test(text);
const asksForCare = /\b(?:tien?e+|tienen|trae|encontre|que hago|que sug(?:u?ieres|ueires)|que recomiendas|que (?:le )?compro)\b/.test(text);
const reportsIllness = /\b(?:mi|nuestro|nuestra)\s+(?:per{2,}o|per{2,}a|gat[oa]|mascota|cachor{2,}[oa])\s+(?:esta\s*(?:muy\s+)?(?:mal|enferm[oa]|decaid[oa])|no (?:quiere comer|come|respira)|vomita|tiembla|sangra|tiene (?:vomitos?|diarrea|fiebre))\b/.test(text);
const urgent = /\b(?:no (?:puede respirar|respira|reacciona)|se (?:esta ahogando|desmayo)|convulsiona|sangrado abundante)\b/.test(text);
if (urgent || reportsIllness) intent = 'clinical';
else if (/\b(?:que dosis|cuanta dosis|puedo (?:darle|medicarlo)|puedo darle|que (?:le doy|le puedo dar|medicamento le doy)|como (?:lo curo|la curo|le doy))\b/.test(text)) intent = 'clinical';
else if (/\bcomo (?:puedo |hago para )?(?:comprar|hacer (?:un|mi) pedido)\b/.test(text)) intent = 'purchase';
else if (mentionsParasites && asksForCare) intent = 'parasite_care';
else if (/^(?:[¿¡]\s*)?que (?:me )?(?:recomiendas?|sugieres?) (?:para|a) (?:mi |un[ao]? )?(?:perr[oa]|gat[oa]|mascota)[?!.\s]*$/.test(text)) intent = 'shopping_advice';
else if (/\b(?:envio|envios|delivery|reparto|entrega)\b|\ba domicilio\b/.test(text)) intent = 'delivery';
else if (/\b(?:quiero|quisiera|puedo) llevar a (?:mi|nuestro|nuestra)\b/.test(text)) intent = 'appointment';
else if (/\b(?:cita|citas)\b/.test(text) && /\b(?:quiero|necesito|agend(?:ar|o)|reserv(?:ar|o)|separ(?:ar|o)|sac(?:ar|o))\b/.test(text)) intent = 'appointment';
else if (/\b(?:veterinari[oa]s?|emergencias?|urgencias?)\b/.test(text) && /\b(?:hay|tiene[ns]?|cuentan con|atienden|disponible|emergencias?|urgencias?)\b/.test(text)) intent = 'schedule';
else if (/\b(pago|pagos|pagar|yape|tarjeta|transferencia|efectivo)\b/.test(text)) intent = 'payments';
else if (/\b(precio|precios|cuesta|cuestan|vale|costo|cotizacion|cobran)\b/.test(text) && /\b(servicio|consulta|cirugia|esterilizacion|traumatologia|curacion|vacuna|vacunacion|tratamiento|internamiento|ecografia|radiografia|laboratorio|hemograma|bioquimica|microscopia|oftalmologia)\b/.test(text)) intent = 'service_prices';
else if (/\bdonde\s+(?:puedo\s+)?(?:comprar|compro|conseguir|consigo|venden|encuentro)\s+\S/.test(text)) intent = 'product';
else if (/\b(horario|horarios|ubicacion|direccion|direcciones|donde|contacto|telefono|whatsapp|cita|citas|atienden|atencion|abren|cierran|hospitalizacion|24 horas)\b/.test(text)) intent = 'schedule';
else if (/\b(servicio|servicios|rayos|ecografia|ecografias|cirugia|cirugias|laboratorio|hemograma|bioquimica|microscopia|oftalmologia|esterilizacion|traumatologicas|curaciones|vacunas|vacunacion|tratamiento|tratamientos|internamiento|medicina veterinaria)\b/.test(text)) intent = 'services';
else if (/\b(oferta|ofertas|promocion|promociones|descuento|descuentos)\b/.test(text)) intent = 'promotions';
else if (/^(?:(?:hola+|buenas|oye|oe)[,\s]+)?[¿¡\s]*(?:tu\s+)?(?:quien\s+(?:eres|habla)|con\s+quien\s+hablo|como\s+te\s+llamas|eres\s+(?:(?:una\s+)?persona\s+o\s+)?(?:un\s+)?bot|que\s+puedes\s+hacer)[?!.,\s]*$/.test(text)) intent = 'identity';
else if (/^(?:(?:hola|buenas)[,\s]+)?[¿¡]?que\s+(?:nos\s+)?ofrece(?:n)?(?:\s+balto(?:\s+veterinaria)?)?[?!.\s]*$/.test(text)) intent = 'overview';
else if (/\b(categoria|categorias)\b/.test(text)) intent = 'categories';
else if (/\b(alimento|alimentos|accesorio|accesorios|higiene|juguete|juguetes|salud|medicamento|medicamentos)\b/.test(text) && !/\b(precio|cuesta|cuestan|stock|disponible|disponibilidad)\b/.test(text)) intent = 'category';
else if (/\b(precio|precios|cuesta|cuestan|vale|valen|stock|disponible|disponibles|disponibilidad|producto|productos|tienen|venden|busco|quiero|chow|whiskas|purina|pelota|collar|correa|shampoo|heno|arena|rascador|comedero|cepillo|suplemento|bal-)\b/.test(text)) intent = 'product';
else if (/^[¡!¿?\s]*(buenas+[,\s]+hol+a+|hol+a+|buenas+|buenos dias|buenas tardes|buenas noches|hola balto|gracias+)[!?.\s]*$/.test(text)) intent = 'greeting';
// Solo se reutiliza el SKU ante una pregunta explícita de seguimiento.
const followUp = intent !== 'parasite_care' && /^(?:[¿¡]\s*)?(?:y\s+)?(?:cuanto (?:cuesta|vale|esta)|cual es (?:el|su) precio|que precio tiene|(?:cuantas?|cuantos?) (?:bolsas?|unidades?) (?:quedan|hay|tienen)|(?:hay|queda) stock|(?:esta|sigue) disponible)[?!.,\s]*$/.test(text);
const previousSku = input.body?.productSku;
const rememberedSku = typeof previousSku === 'string' && /^[A-Z0-9][A-Z0-9-]{0,39}$/i.test(previousSku) ? previousSku : '';
if (followUp) intent = rememberedSku ? 'product' : 'product_clarification';
const stop = new Set('hola por favor cuanto cuesta cuestan vale valen precio precios del de la el los las un una unos unas para y o hay tiene tienes tienen teneis mi mis tu tus su sus nuestro nuestra venden donde puedo comprar compro conseguir consigo encuentro disponible disponibles disponibilidad stock producto productos busco quiero saber me puedes decir cual es son en balto veterinaria perro perros gato gatos alimento alimentos'.split(' '));
let q = followUp ? rememberedSku : text.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w && !stop.has(w)).join(' ').slice(0, 100);
const explicitSpecies = /\bperr[oa]s?\b/.test(text) ? 'perro' : (/\bgat[oa]s?\b/.test(text) ? 'gato' : '');
const previousSpecies = input.body?.shoppingSpecies;
const previousCategory = input.body?.shoppingCategory;
const categoryNames = {
  alimentos: /\balimentos?\b/,
  accesorios: /\baccesorios?\b/,
  higiene: /\bhigiene\b/,
  juguetes: /\bjuguetes?\b/,
};
const explicitCategory = Object.keys(categoryNames).find(name => categoryNames[name].test(text)) || '';
const ageMatch = text.match(/\b(cachorr[oa]s?|gatit[oa]s?|adult[oa]s?)\b/);
const ageFollowUp = !!ageMatch && /^(?:[¿¡]\s*)?(?:y\s+)?(?:es\s+|para\s+(?:un[ao]?\s+)?)?(?:cachorr[oa]s?|gatit[oa]s?|adult[oa]s?)(?:[,¿¡?.!\s]+(?:que tienen|que hay|tienen algo))?[?!.,\s]*$/.test(text);
const knownCategory = typeof previousCategory === 'string' && Object.hasOwn(categoryNames, previousCategory);
const speciesFollowUp = !!explicitSpecies && /^(?:[¿¡]\s*)?(?:y\s+)?(?:es\s+|para\s+(?:mi\s+|un[ao]?\s+)?)?(?:perr[oa]s?|gat[oa]s?)[?!.,\s]*$/.test(text);
const catalogView = /^(?:[¿¡]\s*)?(?:los mas baratos|menor precio|(?:y )?(?:el )?mas barato)[?!.,\s]*$/.test(text) ? 'price'
  : /^(?:[¿¡]\s*)?(?:solo disponibles|solo en stock)[?!.,\s]*$/.test(text) ? 'available' : '';
const size = text.match(/^(?:[¿¡]\s*)?(?:y\s+)?(?:tiene[ns]?\s+)?(?:en|de)\s+(\d{1,3})\s*(kg|g|ml|l)[?!.,\s]*$/);
const previousProduct = input.body?.shoppingProduct;
if (size && rememberedSku && typeof previousProduct === 'string' && previousProduct.length <= 100) {
  intent = 'product';
  q = (normalize(previousProduct).replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l)\b/g, '').trim() + ' ' + size[1] + ' ' + size[2]).trim().slice(0, 100);
}
const categoryFollowUp = ageFollowUp || speciesFollowUp || !!catalogView || !!size;
if (categoryFollowUp && knownCategory && !(size && rememberedSku && intent === 'product') && (['unknown', 'product', 'category'].includes(intent) || catalogView)) intent = 'category';
const shoppingCategory = intent === 'category' ? (explicitCategory || (categoryFollowUp && knownCategory ? previousCategory : '')) : '';
const previousAge = input.body?.shoppingAge;
const age = (catalogView || size) && knownCategory && ['cachorro', 'gatito', 'adulto'].includes(previousAge) ? previousAge : intent === 'category' && ageMatch && (shoppingCategory === 'alimentos' || ageFollowUp && !shoppingCategory)
  ? ageMatch[1].replace(/s$/, '').replace(/a$/, 'o') : '';
const inheritedSpecies = ['perro', 'gato'].includes(previousSpecies) && (ageFollowUp || ((catalogView || size) && knownCategory) || /^[¿¡]?(?:alimentos?|accesorios?|higiene|juguetes?)[?!.,\s]*$/.test(text)) ? previousSpecies : '';
const ageSpecies = age.startsWith('gatit') ? 'gato' : age.startsWith('cachorr') ? 'perro' : '';
const species = explicitSpecies || ageSpecies || inheritedSpecies;
return [{ json: { intent, text, q, status, followUp, species, shoppingCategory, age, urgent, size: size ? size[1] + ' ' + size[2] : '', catalogView: knownCategory ? catalogView : '' } }];
