const context = $('Recibir consulta').first().json;
const contactResponse = $('Ver horarios y contacto').first().json;
const business = contactResponse.data;
const plan = $('Elegir qué buscar').first().json;
const response = plan.path === '/api/vet/schedule'
  ? contactResponse
  : plan.reuseProduct ? context.initialProduct : $input.first().json;
const publicBase = '__BALTO_ORIGIN__'; // n8n-prepare.cjs pone aquí DRUPAL_BASE_URL.
let status = context.status;
let reply = '';
let links = [];
let productContext = {};
let refineBy = '';
const contact = business?.whatsapp ? `Puedes escribirnos al WhatsApp ${business.whatsapp} para consultas o citas.` : '';
const cleanUrl = (url, allowedExternal = false) => {
  if (typeof url !== 'string') return '';
  if (url.startsWith('/') && !url.startsWith('//')) return publicBase + url;
  if (allowedExternal && /^https:\/\/wa\.me\/[0-9]+(?:\?|$)/.test(url)) return url;
  return '';
};
if (context.intent === 'clinical') {
  reply = context.urgent
    ? 'Busca atención veterinaria de urgencia ahora. Llama a BALTO o acude al centro veterinario más cercano.'
    : 'Para evaluar los síntomas o indicar un tratamiento, tu mascota necesita atención veterinaria. Si parece una urgencia, llama a BALTO o acude a un centro veterinario.';
  const phone = business?.phone_url;
  if (typeof phone === 'string' && /^tel:\+?\d+$/.test(phone)) links.push({ label: 'Llamar a BALTO', url: phone });
}
else if (context.intent === 'identity') {
  reply = 'Soy el asistente virtual de BALTO Veterinaria en Juliaca. ¿Buscas algo para tu mascota? Puedo ayudarte con productos, precios, horarios o citas.';
}
else if (!business || !response.data) {
  status = 503;
  reply = 'No puedo consultar los datos de BALTO en este momento. Inténtalo de nuevo en unos minutos.';
}
else if (context.intent === 'greeting') reply = '¡Hola! Soy el asistente virtual de BALTO. Cuéntame qué necesitas y te ayudo.';
else if (context.intent === 'shopping_advice') {
  reply = '¡Claro! ¿Qué estás buscando para tu mascota: alimento, algo para el paseo, higiene o un juguete? Cuéntame qué necesitas y te muestro opciones de la tienda.';
}
else if (context.intent === 'delivery') {
  reply = 'Puedes solicitar retiro en tienda. Si necesitas entrega a domicilio, consulta por WhatsApp si BALTO puede atender tu zona y cuál sería el costo.';
}
else if (context.intent === 'appointment') {
  reply = 'Escríbenos por WhatsApp para coordinar tu cita y confirmar qué horarios están disponibles.';
}
else if (context.intent === 'purchase') {
  reply = `Abre la tienda, elige un producto y agrégalo al carrito. Desde el carrito puedes continuar al pedido y revisar las opciones de retiro y pago. ${contact}`;
  links.push({label: 'Ir a la tienda', url: cleanUrl('/tienda')});
}
else if (context.intent === 'parasite_care') {
  reply = 'Si tu mascota tiene pulgas o garrapatas, el equipo de BALTO puede orientarte sobre qué producto es adecuado según su especie, edad y peso. Escríbenos por WhatsApp y cuéntanos qué encontraste. Si está decaída o se siente mal, solicita una evaluación veterinaria.';
}
else if (context.intent === 'overview') {
  const services = response.data.slice(0, 5).map(service => service.title).join(', ');
  const clinic = services ? `Servicios veterinarios: ${services}.\n` : '';
  reply = `${clinic}En la tienda encuentras alimentos, accesorios y productos de cuidado. También puedes separar una cita por WhatsApp.`;
  links = [
    { label: 'Ver servicios', url: cleanUrl('/#servicios') },
    { label: 'Ver tienda', url: cleanUrl('/tienda') },
  ];
}
else if (context.intent === 'promotions') {
  reply = 'No tengo promociones registradas para confirmar. Puedes revisar los precios en la tienda o consultar las ofertas vigentes por WhatsApp.';
  links = [{ label: 'Ver tienda', url: cleanUrl('/tienda') }];
}
else if (context.intent === 'schedule') {
  reply = `Hospitalización: ${business.hospitalization}.\nAtención en tienda/consultorio: ${business.consultation_schedule}${business.schedule_is_example && !/ejemplo/i.test(business.consultation_schedule) ? ' (horario de ejemplo)' : ''}\nSedes:\n${(business.addresses || []).map(a => '• ' + a).join('\n')}\n${contact}`;
}
else if (context.intent === 'services') reply = `Nuestros servicios:\n${response.data.map(s => '• ' + s.title + ': ' + s.description).join('\n')}\n${business.service_pricing_note || ''}\n${contact}`;
else if (context.intent === 'payments') reply = `Medios de pago en el local: ${business.payment_methods || 'Consulta los medios disponibles por WhatsApp'}.${business.yape_number ? '\nYape del establecimiento: ' + business.yape_number + '.' : ''}\nEl WhatsApp de atención es ${business.whatsapp}.\nEn la web puedes solicitar retiro con pago al recoger o Yape coordinado. Confirma disponibilidad y total con BALTO antes de pagar. La opción Pago simulado es solo académica y no genera cobros.`;
else if (context.intent === 'service_prices') reply = `${business.service_pricing_note || 'Solicita una cotización de servicios por WhatsApp.'}\n${contact}`;
else if (context.intent === 'categories') reply = `Categorías de la tienda:\n${response.data.map(c => '• ' + c.name).join('\n')}\nDime el nombre de una categoría o de un producto para consultar precios y existencias.`;
else if (context.intent === 'product_clarification') reply = '¿De qué producto quieres saber el precio o la disponibilidad? Escríbeme su nombre o código.';
else if (context.shoppingCategory === 'alimentos' && !context.species) {
  reply = '¿Buscas alimento para perro o para gato?';
  refineBy = 'species';
  productContext = { productSku: null };
}
else if (context.intent === 'product' || context.intent === 'category') {
  let products = response.data;
  if (context.catalogView) products = products.filter(product => product.available);
  if (context.catalogView === 'price') products.sort((a, b) => Number(a.price_number) - Number(b.price_number));
  productContext = { productSku: products.length === 1 &&
    (response.meta?.total ?? products.length) === 1 ? products[0].sku : null };
  productContext.shoppingProduct = productContext.productSku ? products[0].name : '';
  if (!products.length && context.catalogView) reply = 'No encontré productos disponibles para esta búsqueda.';
  else if (!products.length) reply = `No encontré productos que coincidan. Puedes consultar por nombre o SKU, o preguntar por las categorías. ${contact}`;
  else {
    reply = products.slice(0, 5).map(p => p.available ? `• ${p.name} cuesta ${p.price} y hay ${p.stock} ${p.stock === 1 ? 'unidad disponible' : 'unidades disponibles'}.` : `• ${p.name}: ese producto está agotado por ahora. Su precio de referencia es ${p.price}.`).join('\n');
    if (context.catalogView === 'price') reply = 'Opciones disponibles de menor a mayor precio entre los resultados consultados.\n' + reply;
    if (products.length > 5 || (response.meta?.total || 0) > 5) reply += '\nTe muestro hasta cinco opciones. Escribe un nombre más específico para afinar la búsqueda.';
    if (context.shoppingCategory === 'alimentos' && !context.age && context.species && !context.catalogView) {
      refineBy = context.species === 'gato' ? 'cat-age' : 'dog-age';
      reply += context.species === 'gato' ? '\n¿Es gatito o adulto?' : '\n¿Es cachorro o adulto?';
    }
    if (response.meta?.catalog_is_example) reply += '\nProductos, precios y existencias de ejemplo.';
    links = products.slice(0, 5).map(p => ({ label: 'Ver ' + p.name, url: cleanUrl(p.url) })).filter(l => l.url);
  }
  if (context.shoppingCategory) {
    refineBy ||= 'catalog';
    const query = $('Elegir qué buscar').first().json.path.split('?')[1] || '';
    const filters = [query, context.catalogView ? 'disponibles=1' : '', context.catalogView === 'price' ? 'sort=precio_asc' : ''].filter(Boolean);
    links = links.slice(0, 4);
    links.push({ label: 'Ver resultados en la tienda', url: cleanUrl('/tienda' + (filters.length ? '?' + filters.join('&') : '')) });
  }
}
else reply = 'No entendí bien qué necesitas. ¿Buscas un producto, quieres saber qué servicios ofrecemos o necesitas separar una cita?';
if (business && status === 200) {
  const appointment = ['appointment', 'overview', 'parasite_care'].includes(context.intent);
  let url = cleanUrl(appointment ? business.appointment_url || business.whatsapp_url : business.whatsapp_url, true);
  if (url && !appointment && ['product', 'category', 'delivery'].includes(context.intent)) {
    const message = context.intent === 'delivery' ? 'Hola, ¿hacen entregas a domicilio? Quisiera consultar cobertura y costo.'
      : `Hola, quisiera consultar por ${productContext.shoppingProduct || 'los productos de la tienda'}.`;
    url = url.split('?')[0] + '?text=' + encodeURIComponent(message);
  }
  if (url) links.push({ label: appointment ? 'Separar cita por WhatsApp' : 'Consultar por WhatsApp', url });
}
return [{ json: { status, body: { reply, intent: context.intent, engine: context.engine, links, shoppingSpecies: ['shopping_advice', 'category'].includes(context.intent) ? context.species : '', shoppingCategory: context.shoppingCategory || '', refineBy, shoppingAge: context.age || '', ...productContext } } }];
