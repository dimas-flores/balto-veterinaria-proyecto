// Clasificación inicial con reglas locales.
function classify(input) {
const allowedOrigins = ['__BALTO_ORIGIN__']; // n8n-prepare.cjs pone aquí CHAT_ALLOWED_ORIGIN.
const origin = input.headers?.origin;
const message = input.body?.message;
const normalize = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
let status = 200;
if (origin && !allowedOrigins.includes(origin)) status = 403;
else if (typeof message !== 'string' || !message.trim() || message.length > 500) status = 400;
const text = status === 200 ? normalize(message.trim()) : '';
const rawConversation = input.body?.conversation;
const cleanConversationText = value => value.slice(0, 220)
  .replace(/\bhttps?:\/\/\S+|\b\S+@\S+\.\S+\b/g, '[dato omitido]')
  .replace(/(?:\+?\d[\s().-]*){7,}/g, '[número omitido] ')
  .trim();
const conversation = status === 200 && Array.isArray(rawConversation)
  ? rawConversation.slice(-4).filter(entry => entry && ['user', 'assistant'].includes(entry.role) && typeof entry.text === 'string')
    .map(entry => ({ role: entry.role, text: cleanConversationText(entry.text) })).filter(entry => entry.text)
  : [];
const previous = status === 200 && Array.isArray(rawConversation) ? rawConversation.at(-1) : null;
const previousIntent = previous?.role === 'assistant' && ['purchase', 'appointment', 'schedule', 'product'].includes(previous.intent)
  ? previous.intent : '';
let intent = 'unknown';
const asksCapabilities = /^(?:(?:hola+|buenas|oye|oe)[,\s]+)?[¿¡\s]*(?:tu\s+)?(?:para que sirves|que puedes hacer|como (?:me )?puedes ayudar|en que me puedes ayudar|que haces aqui)(?:[?!. ,]+(?:jaja)+)?[?!.,\s]*$/.test(text);
const mentionsParasites = /\b(?:e?gar{2,}apat(?:as?)?|e?gar{2,}apast|pulgas?)\b/.test(text);
const asksForCare = /\b(?:tien?e+|tienen|trae|encontre|que hago|que sug(?:u?ieres|ueires)|que recomiendas|que (?:le )?compro)\b/.test(text);
const reportsIllness = /\b(?:mi|nuestro|nuestra)\s+(?:per{2,}o|per{2,}a|gat[oa]|mascota|cachor{2,}[oa])\s+(?:esta\s*(?:muy\s+)?(?:mal|enferm[oa]|decaid[oa])|no (?:quiere comer|come|respira)|vomita|tiembla|sangra|tiene (?:vomitos?|diarrea|fiebre))\b/.test(text);
const suspectedPoisoning = /\b(?:veneno|intoxicad[oa]|envenenad[oa])\b/.test(text) ||
  (/\b(?:chocolate|veneno)\b/.test(text) && /\b(?:comio|come|ingirio|ingiere|trago|tomo|lamio|mordio|alcanz[oó]|le di|le dieron)\b/.test(text));
const reportsFallFromHeight = /\b(?:se (?:cayo|cayeron|ha caido)|cayo|cayeron|ha caido|se (?:tiro|lanzo)|salto)\b[^.!?;\n]{0,85}\b(?:pisos?|balcon|ventana|techo|azotea|altura|terraza|metros?)\b/.test(text);
// Prioriza exposiciones y signos concretos; «comió» solo no indica urgencia.
const toxicExposure = /\b(?:pasas?|uvas?|cebollas?|xilitol|lirios?|anticongelante|ibuprofeno|paracetamol|diclofenaco|ivermectina)\b/.test(text) &&
  /\b(?:comio|come|comieron|ingirio|ingiere|trago|bebio|tomo|lamio|mordio|le di|le dieron|le puse|le aplique|lo olio|estuvo en contacto)\b/.test(text);
const severeSigns = /\b(?:no (?:puede (?:orinar|moverse)|orina|hace pis|se mueve|despierta)|intenta orinar y no puede|respira (?:mal|con dificultad|con la boca abierta)|(?:le cuesta|dificultad para) respirar|se ahoga|vomit(?:a|o|os?) con sangre|paralizad[oa]|golpe de calor|(?:lo|la|le) mordio (?:una )?(?:serpiente|culebra|vibora)|(?:serpiente|culebra|vibora) (?:lo|la|le) mordio|(?:parto|pariendo) (?:con problemas|complicado)|no puede parir|se (?:esta muriendo|muere)|(?:no (?:come|quiere comer)|sin comer) (?:desde hace|hace|desde) (?:dias|(?:varios|dos|tres|[2-9]) dias)|(?:abdomen|barriga|panza) (?:muy )?hinchad[oa])\b/.test(text);
const medicationConcern = /\b(?:ibuprofeno|paracetamol|diclofenaco|ivermectina)\b/.test(text) &&
  /\b(?:perr[oa]|gat[oa]|cachorr[oa]|mascota|michi|cuy|conejo|dosis|darle|le puedo dar)\b/.test(text);
const endOfLifeConcern = /\b(?:eutanasia|dormir a (?:mi|nuestro|nuestra) (?:perr[oa]|gat[oa]|mascota))\b/.test(text);
const urgent = suspectedPoisoning || reportsFallFromHeight || toxicExposure || severeSigns || /\b(?:no (?:puede respirar|respira|reacciona)|se (?:esta ahogando|desmayo)|convulsion(?:es|a|ando|o)?|temblando|tiembla|temblores|atropell(?:o|aron|ad[oa])|sangrado|sangra|sangrando)\b/.test(text);
const reportsCough = /\b(?:tiene tos|(?:mi|nuestro|nuestra)\s+(?:perr\w*|gat\w*|mascota|cachorr\w*)\s+(?:tose|esta tosiendo))\b/.test(text);
const clinicalFollowUp = input.body?.clinicalFollowUp === true &&
  /^(?:[¿¡\s]*)(?:(?:es\s+)?(?:un[ao]?\s+)?(?:perr[oa]|gat[oa]|cachorr[oa])\b|(?:desde|hace)\s+(?:ayer|hoy|\d|un[ao]?\b|dos\b|tres\b)|(?:que hago|es grave|puede esperar)\b)/.test(text);
const productMention = /\b(?:collar(?:es)?|camas?|arnes(?:es)?|alimentos?|croquetas?|comederos?|correas?|juguetes?|champu|rascadores?|arena|ricocan|whiskas|dog chow|cat chow)\b/;
const multipleProducts = text.split(/\s+y\s+/).filter(part => productMention.test(part)).length > 1;
const mentionsVaccination = /\bvacun\w*\b/.test(text);
const asksVaccineTiming = mentionsVaccination &&
  /\b(?:a que edad|cada cuanto|cuando (?:vacunar|debo vacunar|se vacuna|le toca|debe vacunarse)|calendario|esquema de vacunacion)\b/.test(text);
if (urgent || reportsIllness || reportsCough || clinicalFollowUp || medicationConcern || endOfLifeConcern) intent = 'clinical';
else if (/\b(?:que dosis|cuanta dosis|puedo (?:darle|medicarlo)|puedo darle|que (?:le doy|le puedo dar|medicamento le doy)|como (?:lo curo|la curo|le doy))\b/.test(text)) intent = 'clinical';
else if (/^(?:[¿¡\s]*)(?:tu\s+)?(?:eres (?:una? )?(?:persona|human[oa]|ia|inteligencia artificial)(?:\s+o\s+(?:una? )?(?:persona|human[oa]|ia|inteligencia artificial))?|eres (?:una? )?(?:persona|human[oa]) o (?:un )?bot)[?!.,\s]*$/.test(text)) intent = 'assistant_ai';
else if (/^[¿¡\s]*(?:tu\s+)?(?:reemplazas? (?:al|a un|a la) veterinari[oa]|(?:puedes|puede|sabes) (?:diagnosticar(?: a mi mascota)?|dar (?:un )?diagnostico)|haces diagnosticos)[?!.,\s]*$/.test(text)) intent = 'assistant_limits';
else if (/^[¿¡\s]*(?:tu\s+)?(?:puedes? (?:ver|leer|acceder a) (?:mis|los) datos(?: personales)?|ves mis datos(?: personales)?)[?!.,\s]*$/.test(text)) intent = 'assistant_privacy';
else if (/^[¿¡\s]*(?:quien te (?:creo|hizo|desarrollo)|quien lo (?:creo|hizo|desarrollo))[?!.,\s]*$/.test(text)) intent = 'assistant_creator';
else if (asksVaccineTiming) intent = 'pet_care';
else if (multipleProducts) intent = 'multiple_products';
else if (/\b(?:comprobante|voucher|captura)\b/.test(text) && /\b(?:enviar|envio|mando|mandar|subir|adjunt\w*|donde|yape|pago)\b/.test(text)) intent = 'payment_receipt';
else if (/\b(?:estado|seguimiento|rastrear|listo|llego|entregado|ver|consultar|recoger|retiro|mis)\b/.test(text) && /\bpedidos?\b/.test(text)) intent = 'order_status';
else if (/\bcomo (?:puedo |hago para )?(?:comprar|hacer (?:un|mi) pedido)\b/.test(text)) intent = 'purchase';
else if (mentionsParasites && asksForCare) intent = 'parasite_care';
else if (/\b(?:cada cuanto|a que edad|desde cuando|cuantas veces|cuando (?:debo|puedo|se debe|hay que|le toca|empiezo)|como (?:cuido|bano|banar|alimento|educo|entreno|cepillo|limpio|corto|socializo)|que (?:debo|tengo que) (?:hacer|darle)|consejos?|cuidados?|recomendaciones?|tips?)\b/.test(text) && /\b(?:perr[oa]s?|gat[oa]s?|cachorr[oa]s?|gatit[oa]s?|perrit[oa]s?|mascotas?)\b|\b(?:vacun\w*|desparasit\w*|esteriliz\w*|castr\w*|bano|alimentacion|croquetas?|dientes|unas|pelo)\b/.test(text)) intent = 'pet_care';
else if (/^(?:[¿¡]\s*)?que (?:me )?(?:recomiendas?|sugieres?) (?:para|a) (?:mi |un[ao]? )?(?:perr[oa]|gat[oa]|mascota)[?!.\s]*$/.test(text)) intent = 'shopping_advice';
else if (/\b(?:envio|envios|delivery|reparto|entrega)\b|\ba domicilio\b/.test(text)) intent = 'delivery';
else if (/\b(?:quiero|quisiera|puedo) llevar a (?:mi|nuestro|nuestra)\b/.test(text)) intent = 'appointment';
else if (/\b(?:cita|citas)\b/.test(text) && /\b(?:quiero|necesito|agend(?:ar|o|a|ame|e)|reserv(?:ar|o|a|ame|e)|separ(?:ar|o|a|ame|e)|sac(?:ar|o|a|ame|que))\b/.test(text)) intent = 'appointment';
else if (/\b(?:veterinari[oa]s?|emergencias?|urgencias?)\b/.test(text) && /\b(?:hay|tiene[ns]?|cuentan con|atienden|disponible|emergencias?|urgencias?)\b/.test(text)) intent = 'schedule';
else if (/\b(pago|pagos|pagar|yape|tarjeta|transferencia|efectivo)\b/.test(text)) intent = 'payments';
else if (/\b(precio|precios|cuesta|cuestan|vale|costo|cotizacion|cobran)\b/.test(text) && /\b(servicio|consulta|cirugia|esterilizacion|traumatologia|curacion|vacunas?|vacunacion|tratamiento|internamiento|ecografias?|radiografias?|laboratorio|hemograma|bioquimica|microscopia|oftalmologia)\b/.test(text)) intent = 'service_prices';
else if (/\b(?:ecografias?|radiografias?|rayos x)\b/.test(text)) intent = 'services';
else if (/\bdonde\s+(?:puedo\s+)?(?:comprar|compro|conseguir|consigo|venden|encuentro)\s+\S/.test(text)) intent = 'product';
else if (/\b(?:a que hora|hasta que hora|que hora abren|que hora cierran)\b/.test(text) || /\b(horario|horarios|ubicacion|direccion|direcciones|donde|contacto|telefono|whatsapp|cita|citas|atienden|atencion|abren|cierran|hospitalizacion|24 horas)\b/.test(text) || /\b(?:dame|pasame|me das|me pasas|cual es|quiero|necesito)\s+(?:solo\s+)?(?:el|tu|su)\s+(?:numero|celular)\b/.test(text) || /\bsolo\s+(?:te\s+pedi\s+)?(?:el\s+)?numero\b/.test(text)) intent = 'schedule';
else if (/\b(servicio|servicios|rayos|ecografia|ecografias|cirugia|cirugias|laboratorio|hemograma|bioquimica|microscopia|oftalmologia|esterilizacion|traumatologicas|curaciones|vacunas|vacunacion|tratamiento|tratamientos|internamiento|medicina veterinaria)\b/.test(text)) intent = 'services';
else if (/\b(oferta|ofertas|promocion|promociones|descuento|descuentos)\b/.test(text)) intent = 'promotions';
else if (asksCapabilities || /^(?:(?:hola+|buenas|oye|oe)[,\s]+)?[¿¡\s]*(?:(?:tu|usted)\s+)?(?:quien\s+(?:eres(?:\s+tu)?|es\s+usted|habla)|con\s+quien\s+hablo|como\s+te\s+llamas|como\s+se\s+llama(?:\s+usted)?|eres\s+(?:(?:una\s+)?persona\s+o\s+)?(?:un\s+)?bot)[?!.,\s]*$/.test(text)) intent = 'identity';
else if (/^(?:(?:hola|buenas)[,\s]+)?[¿¡]?que\s+(?:nos\s+)?ofrece(?:n)?(?:\s+balto(?:\s+veterinaria)?)?[?!.\s]*$/.test(text)) intent = 'overview';
else if (/\b(categoria|categorias)\b/.test(text)) intent = 'categories';
else if (/^[¿¡\s]*(?:(?:dime|dame|muestrame|pasame|quiero ver|quiero saber|cuales son)\s+)?(?:(?:el|los)\s+)?(?:precios?(?:\s+(?:de(?: los)? productos|del catalogo|de la tienda))?|catalogo(?:\s+de productos)?|que productos (?:tienen|venden|hay))(?:[,\s]+(?:si|porfa|por favor|pues))*[?!.,\s]*$/.test(text)) intent = 'catalog';
else if (/\b(alimento|alimentos|accesorio|accesorios|higiene|juguete|juguetes|salud|medicamento|medicamentos)\b/.test(text) && !/\b(precio|cuesta|cuestan|stock|disponible|disponibilidad)\b/.test(text)) intent = 'category';
else if (/\b(precio|precios|cuesta|cuestan|vale|valen|stock|disponible|disponibles|disponibilidad|producto|productos|tienen|venden|busco|quiero|chow|whiskas|purina|pelota|arnes|arneses|collar|collares|cama|camas|correa|shampoo|champu|heno|arena|rascador|comedero|cepillo|suplemento|bal-)\b/.test(text)) intent = 'product';
else if (/^[¡!¿?\s]*(?:nos vemos|hasta luego|hasta pronto|chau|chao|adios|bye|ok(?:ay)?|listo|entendido)[!?.\s]*$/.test(text)) intent = 'acknowledgment';
else if (/^[¡!¿?\s]*(?:oe|oye)(?:\s+amig[oa])?\s+ayuda[!?.\s]*$/.test(text)) intent = 'greeting';
else if (/^[¡!¿?\s]*(buenas+[,\s]+hol+a+|hol+a+|buenas+|buenos dias|buenas tardes|buenas noches|hola balto|gracias+)[!?.\s]*$/.test(text)) intent = 'greeting';
// Los seguimientos cortos reutilizan la intención anterior cuando sigue siendo aplicable.
if (intent === 'unknown' && /^(?:[¿¡]\s*)?(?:y\s+)?como (?:hago|puedo hacer) (?:eso|esto)[?!.,\s]*$/.test(text) &&
    ['purchase', 'appointment'].includes(previousIntent)) intent = previousIntent;
if (intent === 'unknown' && previousIntent === 'schedule' &&
    /^(?:[¿¡]\s*)?(?:y\s+)?(?:hoy|manana|el sabado|el domingo)[?!.,\s]*$/.test(text)) intent = 'schedule';
// Solo se reutiliza el SKU ante una pregunta explícita de seguimiento.
const refersToProduct = previousIntent === 'product' &&
  /^(?:[¿¡]\s*)?(?:y\s+)?(?:(?:ese|esa|eso|este|esta) (?:lo |la )?tienen|(?:lo |la )?tienen (?:ese|esa|eso|este|esta))[?!.,\s]*$/.test(text);
const followUp = !['clinical', 'parasite_care'].includes(intent) && (refersToProduct || /^(?:[¿¡]\s*)?(?:y\s+)?(?:cuanto (?:cuesta|vale|esta)|cual es (?:el|su) precio|que precio tiene|(?:cuantas?|cuantos?) (?:(?:bolsas?|unidades?) )?(?:quedan|hay|tienen)|(?:hay|queda) stock|(?:esta|sigue) disponible)[?!.,\s]*$/.test(text));
const previousSku = input.body?.productSku;
const rememberedSku = typeof previousSku === 'string' && /^[A-Z0-9][A-Z0-9-]{0,39}$/i.test(previousSku) ? previousSku : '';
if (followUp) intent = rememberedSku ? 'product' : 'product_clarification';
const stop = new Set('hola por favor cuanto cuesta cuestan vale valen precio precios del de la el los las un una unos unas para y o hay tiene tienes tienen teneis mi mis tu tus su sus nuestro nuestra venden donde puedo comprar compro conseguir consigo encuentro disponible disponibles disponibilidad stock producto productos busco quiero saber me puedes decir cual es son en balto veterinaria perro perros gato gatos alimento alimentos quisiera necesito gustaria podria decirme podrias podrian indicarme consultar consultarles averiguar interesa presentacion marca actualmente revisando buscando buenas tardes dias noches gracias si porfa porfis plis pues ps pe'.split(' '));
const queryText = text.replace(/\bcollares\b/g, 'collar').replace(/\bcamas\b/g, 'cama').replace(/\b(?:me (?:podria|puede|puedes) (?:decir|indicar)|quisiera (?:saber|consultar)|estoy buscando|me gustaria saber|me interesa comprar|(?:cuantas?|cuantos?) (?:bolsas?|unidades?) (?:les )?(?:quedan|hay|tienen))\b/g, ' ');
let q = followUp ? rememberedSku : queryText.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w && !stop.has(w)).join(' ').slice(0, 100);
const explicitSpecies = /\bperr(?:[oa]|it[oa])s?\b/.test(text) ? 'perro' : (/\bgat(?:[oa]|it[oa])s?\b/.test(text) ? 'gato' : '');
const previousSpecies = input.body?.shoppingSpecies;
const previousCategory = input.body?.shoppingCategory;
const categoryNames = {
  alimentos: /\b(?:alimentos?|croquetas?|comida)\b/,
  accesorios: /\baccesorios?\b/,
  higiene: /\bhigiene\b/,
  juguetes: /\bjuguetes?\b/,
};
const explicitCategory = Object.keys(categoryNames).find(name => categoryNames[name].test(text)) || '';
const ageMatch = text.match(/\b(cachorr[oa]s?|gatit[oa]s?|adult[oa]s?)\b/);
const ageFollowUp = !!ageMatch && /^(?:[¿¡]\s*)?(?:y\s+)?(?:es\s+|para\s+(?:un[ao]?\s+)?)?(?:cachorr[oa]s?|gatit[oa]s?|adult[oa]s?)(?:[,¿¡?.!\s]+(?:que tienen|que hay|tienen algo))?[?!.,\s]*$/.test(text);
const knownCategory = typeof previousCategory === 'string' && Object.hasOwn(categoryNames, previousCategory);
const previousBudget = input.body?.shoppingBudget;
const hasBudgetContext = ['perro', 'gato'].includes(previousSpecies) && typeof previousBudget === 'number' &&
  Number.isFinite(previousBudget) && previousBudget > 0 && previousBudget < 10000;
const knownSearch = knownCategory || hasBudgetContext;
const speciesFollowUp = !!explicitSpecies && /^(?:[¿¡]\s*)?(?:y\s+)?(?:es\s+|para\s+(?:mi\s+|un[ao]?\s+)?)?(?:perr[oa]s?|gat[oa]s?)[?!.,\s]*$/.test(text);
const ordering = /\b(?:mas baratos?|mas baratas?|menor precio)\b/.test(text) ? 'price'
  : /\b(?:mas caros?|mas caras?|mayor precio)\b/.test(text) ? 'price_desc' : '';
const countMatch = text.match(/\b([1-5]|uno|una|dos|tres|cuatro|cinco)\s+(?:(?:opciones|productos|alimentos|accesorios|juguetes)\b|(?:mas|mejores)\b)/);
const resultLimit = countMatch ? ({uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5}[countMatch[1]] ?? Number(countMatch[1])) : null;
const entireCatalog = /\b(?:todos los productos|todo el catalogo|catalogo completo)\b/.test(text);
const catalogView = ordering || /^(?:[¿¡]\s*)?(?:los mas baratos|menor precio|(?:y )?(?:el )?mas barato)[?!.,\s]*$/.test(text) ? 'price'
  : /^(?:[¿¡]\s*)?(?:solo disponibles|solo en stock)[?!.,\s]*$/.test(text) ? 'available' : '';
const size = text.match(/^(?:[¿¡]\s*)?(?:y\s+)?(?:tiene[ns]?\s+)?(?:en|de)\s+(\d{1,3})\s*(kg|g|ml|l)[?!.,\s]*$/);
const previousProduct = input.body?.shoppingProduct;
if (size && rememberedSku && typeof previousProduct === 'string' && previousProduct.length <= 100) {
  intent = 'product';
  q = (normalize(previousProduct).replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l)\b/g, '').trim() + ' ' + size[1] + ' ' + size[2]).trim().slice(0, 100);
}
const money = text.match(/(?:s\/\.?\s*(\d{1,4}(?:[.,]\d{1,2})?)|\b(?:hasta|presupuesto(?: de)?|menos de|maximo(?: de)?)\s+(\d{1,4}(?:[.,]\d{1,2})?)\b|\b(\d{1,4}(?:[.,]\d{1,2})?)\s+sol(?:es)?\b)/);
const parsedBudget = money ? Number((money[1] || money[2] || money[3]).replace(',', '.')) : null;
const budget = parsedBudget > 0 ? parsedBudget : null;
if (budget !== null && explicitSpecies && ['unknown', 'product', 'shopping_advice'].includes(intent) &&
    /\b(?:hay (?:algo|opciones|productos)|(?:algo|opciones|productos) para|que tienen)\b/.test(text) && !productMention.test(text)) intent = 'category';
const budgetFollowUp = budget !== null && knownSearch &&
  /^[¿¡\s]*(?:y\s+)?(?:si\s+)?(?:tengo|cuento con|mi presupuesto es|hasta|maximo|menos de|s\/|\d)/.test(text);
const categoryFollowUp = ageFollowUp || speciesFollowUp || !!catalogView || !!size || budgetFollowUp;
if (categoryFollowUp && knownSearch && !(size && rememberedSku && intent === 'product') && (['unknown', 'product', 'category'].includes(intent) || catalogView)) intent = 'category';
if (explicitCategory && ['unknown', 'product', 'shopping_advice', 'pet_care'].includes(intent) &&
    (/\b(?:busco|quiero|tienen|muestrame|recomiendame)\b/.test(text) && /\b(?:economicas?|economicos?|baratas?|baratos?)\b/.test(text) || budget !== null) &&
    !/\b(?:whiskas|ricocan|ricocat|chow|purina|bal-)\b/.test(text)) intent = 'category';
if (ordering && ['unknown', 'product', 'category', 'catalog', 'shopping_advice'].includes(intent)) {
  intent = explicitCategory || explicitSpecies || knownSearch ? 'category' : 'catalog';
}
if (entireCatalog && ['unknown', 'product', 'category', 'catalog'].includes(intent)) intent = 'catalog';
const shoppingCategory = intent === 'category' ? (explicitCategory || (categoryFollowUp && knownCategory ? previousCategory : '')) : '';
const previousAge = input.body?.shoppingAge;
const age = intent === 'category' && ageMatch && (shoppingCategory === 'alimentos' || ageFollowUp)
  ? ageMatch[1].replace(/s$/, '').replace(/a$/, 'o')
  : (catalogView || size || budgetFollowUp) && knownCategory && ['cachorro', 'gatito', 'adulto'].includes(previousAge) ? previousAge : '';
const inheritedSpecies = ['perro', 'gato'].includes(previousSpecies) && (categoryFollowUp && knownSearch || /^[¿¡]?(?:alimentos?|accesorios?|higiene|juguetes?)[?!.,\s]*$/.test(text)) ? previousSpecies : '';
const shoppingBudget = ['category', 'catalog'].includes(intent)
  ? budget ?? (categoryFollowUp && hasBudgetContext ? previousBudget : null)
  : null;
const ageSpecies = age.startsWith('gatit') ? 'gato' : age.startsWith('cachorr') ? 'perro' : '';
const species = explicitSpecies || ageSpecies || inheritedSpecies;
return { noAi: input.body?.noAi === true, intent, message, conversation, text, q, status, mentionsVaccination, asksCapabilities, followUp, species, shoppingCategory, shoppingBudget, age, urgent, medicationConcern, reportsCough, clinicalFollowUp, size: size ? size[1] + ' ' + size[2] : '', catalogView: ordering || (knownSearch ? catalogView : ''), resultLimit };
}
const input = $input.first().json;
const primary = classify(input);
const supported = new Set(['product', 'category', 'services', 'service_prices', 'schedule', 'payments', 'payment_receipt', 'order_status']);
if (primary.status === 200 && !['clinical', 'parasite_care'].includes(primary.intent)) {
  const parts = primary.message.split(/\?\s*¿?|\s+y\s+/i).map(part => part.trim()).filter(Boolean);
  if (parts.length === 2) {
    const classified = parts.map(message => classify({ ...input, body: { ...input.body, message, noAi: true } }));
    const [first, second] = classified;
    // Dos preguntas independientes. Los componentes de una sola consulta de horario quedan juntos.
    if (classified.every(part => supported.has(part.intent) && (part.intent !== 'product' || part.q)) &&
        (first.intent !== second.intent || first.intent === 'product' && first.q !== second.q)) {
      return [{ json: { ...first, secondaryQuestion: second } }];
    }
  }
}
return [{ json: primary }];
