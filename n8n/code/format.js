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
let facts = ''; // Datos completos para que Gemini elija qué responder; no se envían al cliente.
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
  if (context.urgent) {
    const number = business?.whatsapp || '986 866036';
    const hospitalization = business?.hospitalization || '24 horas';
    reply = `Entiendo su preocupación. Es una urgencia. Llámenos ya al ${number}. Hospitalización: ${hospitalization}. Si no puede comunicarse, acuda de inmediato al centro veterinario más cercano.`;
    links.push({ label: 'Escribir a BALTO por WhatsApp', url: 'https://wa.me/51986866036' });
  } else if (context.clinicalFollowUp) {
    reply = 'Gracias por la información. Cuéntenos ese detalle al coordinar la evaluación con nuestro equipo veterinario.';
  } else if (context.medicationConcern) {
    reply = 'No administre ese medicamento sin indicación veterinaria. Puede ser peligroso para su mascota. Llame a BALTO al ' + (business?.whatsapp || '986 866036') + ' para una evaluación.';
  } else if (context.reportsCough) {
    const question = context.species ? '¿Desde cuándo tiene tos?' : '¿Es un perro o un gato?';
    reply = 'Entiendo que le preocupe la tos de su mascota. Escríbanos o llámenos para que nuestro equipo veterinario la evalúe. ' + question;
  } else {
    reply = 'Entiendo su preocupación. Para coordinar una evaluación con nuestro equipo veterinario, llámenos al ' + (business?.whatsapp || '986 866036') + '.';
  }
  const phone = business?.phone_url || (context.urgent ? 'tel:+51986866036' : '');
  if (typeof phone === 'string' && /^tel:\+?\d+$/.test(phone)) links.push({ label: 'Llamar a BALTO', url: phone });
}
else if (context.intent === 'assistant_ai') reply = 'Soy el asistente virtual con inteligencia artificial de BALTO Veterinaria.';
else if (context.intent === 'assistant_limits') reply = 'No reemplazo al veterinario ni hago diagnósticos. Para una evaluación con nuestro equipo, puede elegir un turno desde este chat o llamarnos.';
else if (context.intent === 'assistant_privacy') reply = 'No necesito datos personales para ayudarle. Por favor, no los comparta en el chat.';
else if (context.intent === 'assistant_creator') reply = 'Soy el asistente virtual desarrollado para BALTO Veterinaria en Juliaca.';
else if (context.intent === 'identity') {
  reply = context.asksCapabilities
    ? 'Puedo buscar productos e informarle de su precio y disponibilidad, mostrarle los servicios y horarios de BALTO o ayudarle a elegir un turno para una cita desde este chat. Por ejemplo, puede preguntar «¿Cuánto cuesta el Dog Chow?»'
    : 'Soy el asistente virtual de BALTO Veterinaria en Juliaca. Puedo ayudarle con productos, precios, horarios o citas.';
}
else if (context.intent === 'pet_care') reply = `Para orientarte bien sobre el cuidado de tu mascota hay que considerar su especie, edad y estado de salud. Nuestro equipo veterinario puede indicarte lo más conveniente en tu caso. ${business?.whatsapp ? 'Escríbenos al WhatsApp ' + business.whatsapp + ' o separa una cita.' : ''}`;
else if (context.intent === 'greeting') reply = '¡Hola! Soy el asistente virtual de BALTO. Cuénteme qué necesita y con gusto le ayudaré.';
else if (context.intent === 'acknowledgment') reply = 'De acuerdo. Si necesita algo más, aquí estamos para ayudarle.';
else if (context.intent === 'off_topic') reply = 'Puedo ayudarle con productos, servicios, citas y cuidados cotidianos de mascotas. ¿Desea consultar algo sobre BALTO?';
else if (context.intent === 'unknown') reply = 'No pude interpretar su consulta en este momento. ¿Puede decirme en una frase qué le gustaría saber?';
else if (!business || !response.data) {
  status = 503;
  reply = 'No puedo consultar los datos de BALTO en este momento. Inténtalo de nuevo en unos minutos.';
}
else if (context.intent === 'shopping_advice') {
  reply = '¡Claro! ¿Qué estás buscando para tu mascota: alimento, algo para el paseo, higiene o un juguete? Cuéntame qué necesitas y te muestro opciones de la tienda.';
}
else if (context.intent === 'delivery') {
  reply = 'Puedes solicitar retiro en tienda. Si necesitas entrega a domicilio, consulta por WhatsApp si BALTO puede atender tu zona y cuál sería el costo.';
}
else if (context.intent === 'appointment') {
  reply = 'Puedo ayudarle a preparar su solicitud de cita. El equipo de BALTO confirmará la disponibilidad por WhatsApp.';
}
else if (context.intent === 'order_status') {
  reply = 'Si hizo el pedido con una cuenta, inicie sesión y abra la pestaña «Pedidos» para ver su estado. Si compró como invitado, escríbanos por WhatsApp con su número de pedido para que BALTO lo verifique.';
  links.push({label: 'Abrir Mi cuenta', url: cleanUrl('/user')});
}
else if (context.intent === 'payment_receipt') {
  reply = 'Abra la confirmación de su pedido y pulse «Enviar comprobante por WhatsApp». El mensaje incluye el número de pedido y el total. Adjunte la imagen en WhatsApp después de que BALTO le confirme el importe. El envío no confirma el pago automáticamente.';
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
  reply = `${clinic}En la tienda encontrará alimentos, accesorios y productos de cuidado. También puede elegir un turno desde este chat.`;
  links = [
    { label: 'Ver servicios', url: cleanUrl('/#servicios') },
    { label: 'Ver tienda', url: cleanUrl('/tienda') },
  ];
}
else if (context.intent === 'promotions') {
  reply = 'No tengo promociones registradas para confirmar. Puedes revisar los precios en la tienda o consultar las ofertas vigentes por WhatsApp.';
  links = [{ label: 'Ver tienda', url: cleanUrl('/tienda') }];
}
else if (context.intent === 'schedule' && (() => {
  // Responde solo lo que se preguntó: número, dirección u horario. Si no se distingue, se da todo.
  const asked = context.text || '';
  const wantsPhone = /\b(numero|telefono|celular|whatsapp|llamar|llamo|llamarlos|contacto)\b/.test(asked);
  const wantsAddress = /\b(donde|direccion|direcciones|ubicacion|ubicados|queda|quedan|sede|sedes|llegar)\b/.test(asked);
  const wantsHours = /\b(horario|horarios|abren|abre|cierran|atienden|atiende|hora|horas|domingo|domingos|sabado|sabados|lunes|feriado|feriados)\b/.test(asked);
  facts = `Hospitalización: ${business.hospitalization}.\nAtención en tienda/consultorio: ${business.consultation_schedule}\nSedes:\n${(business.addresses || []).map(a => '• ' + a).join('\n')}\nWhatsApp y teléfono: ${business.whatsapp}`;
  if (!wantsPhone && !wantsAddress && !wantsHours) return false;
  const parts = [];
  if (wantsPhone) parts.push(`Claro, nuestro número de WhatsApp es ${business.whatsapp}. Puedes escribirnos o llamar a ese mismo número.`);
  if (wantsAddress) parts.push(`Estamos en Juliaca:\n${(business.addresses || []).map(a => '• ' + a).join('\n')}`);
  if (wantsHours) parts.push(`Hospitalización: ${business.hospitalization}.\nAtención en tienda/consultorio: ${business.consultation_schedule}${business.schedule_is_example && !/ejemplo/i.test(business.consultation_schedule) ? ' (horario de ejemplo)' : ''}`);
  reply = parts.join('\n\n');
  return true;
})()) { /* respuesta ya armada */ }
else if (context.intent === 'schedule') {
  reply = `Hospitalización: ${business.hospitalization}.\nAtención en tienda/consultorio: ${business.consultation_schedule}${business.schedule_is_example && !/ejemplo/i.test(business.consultation_schedule) ? ' (horario de ejemplo)' : ''}\nSedes:\n${(business.addresses || []).map(a => '• ' + a).join('\n')}\n${contact}`;
}
else if (context.intent === 'services' && context.mentionsVaccination) {
  const service = response.data.find(item => /vacun/i.test(item.title));
  reply = service
    ? 'Sí, ofrecemos vacunación en BALTO. Para coordinar, puede elegir un turno desde este chat.'
    : 'No puedo confirmar ese servicio con la información publicada. Escríbanos por WhatsApp para verificarlo.';
}
else if (context.intent === 'services') reply = `Nuestros servicios:\n${response.data.map(s => '• ' + s.title + ': ' + s.description).join('\n')}\n${business.service_pricing_note || ''}\n${contact}`;
else if (context.intent === 'payments') reply = `Medios de pago en el local: ${business.payment_methods || 'Consulta los medios disponibles por WhatsApp'}.${business.yape_number ? '\nYape del establecimiento: ' + business.yape_number + '.' : ''}\nEl WhatsApp de atención es ${business.whatsapp}.\nEn la web puedes solicitar retiro con pago al recoger o Yape coordinado. Confirma disponibilidad y total con BALTO antes de pagar. La opción Pago simulado es solo académica y no genera cobros.`;
else if (context.intent === 'service_prices') {
  const normalize = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const service = response.data.find(item => {
    const title = normalize(item.title);
    return context.text.includes(title) || (title.includes('vacun') && context.mentionsVaccination) || (title.includes('ecografia') && /\becografias?\b/.test(context.text));
  });
  const available = service ? `Sí, ofrecemos ${service.title.toLowerCase()}. ` : '';
  reply = available + 'El precio de este servicio no está publicado. Escríbanos por WhatsApp para consultar el costo.';
}
else if (context.intent === 'multiple_products') reply = 'Puedo buscar ambos productos. Envíeme uno por mensaje para mostrarle el precio y la disponibilidad de cada uno.';
else if (context.intent === 'categories') reply = `Categorías de la tienda:\n${response.data.map(c => '• ' + c.name).join('\n')}\nDime el nombre de una categoría o de un producto para consultar precios y existencias.`;
else if (context.intent === 'product_clarification') reply = '¿De qué producto quieres saber el precio o la disponibilidad? Escríbeme su nombre o código.';
else if (context.shoppingCategory === 'alimentos' && !context.species) {
  reply = '¿Buscas alimento para perro o para gato?';
  refineBy = 'species';
  productContext = { productSku: null };
}
else if (['product', 'category', 'catalog'].includes(context.intent)) {
  let products = response.data;
  if (context.intent === 'product' && context.q === 'collar' && !plan.alternative) products = products.filter(product => !/isabelino/i.test(product.name));
  const budget = context.shoppingBudget;
  if (budget != null && !context.shoppingCategory) {
    products = products.filter(product => !/^salud\b/i.test(product.category || ''));
  }
  const ranked = budget !== null && budget !== undefined || ['price', 'price_desc'].includes(context.catalogView);
  if (context.catalogView || ranked) products = products.filter(product => product.available);
  if (budget != null) products = products.filter(product => Number.isFinite(Number(product.price_number)) && Number(product.price_number) <= budget);
  const descending = context.catalogView === 'price_desc';
  if (ranked) products.sort((a, b) => (descending ? -1 : 1) * (Number(a.price_number) - Number(b.price_number)));
  const limit = context.resultLimit ?? (ranked ? 3 : 5);
  productContext = { productSku: products.length === 1 &&
    (response.meta?.total ?? products.length) === 1 ? products[0].sku : null };
  productContext.shoppingProduct = productContext.productSku ? products[0].name : '';
  if (plan.alternative === 'cat_harness') {
    const harness = products.find(product => product.available);
    reply = 'Por ahora no tenemos collares de paseo para gato en el catálogo.';
    if (harness) {
      reply += ` Si busca un accesorio para paseo, tenemos ${harness.name} por ${harness.price}, con ${harness.stock} unidades disponibles.`;
      links.push({label: 'Ver arnés para gato', url: cleanUrl(harness.url)});
    }
  }
  else if (!products.length && budget != null) reply = `No encontré opciones disponibles de hasta S/ ${budget.toFixed(2)} para esa búsqueda. ¿Desea ampliar el presupuesto o ver otras presentaciones?`;
  else if (!products.length && context.catalogView) reply = 'No encontré productos disponibles para esta búsqueda.';
  else if (!products.length) {
    reply = 'Por ahora no tenemos ese producto en el catálogo. Puede revisar otros productos disponibles en la tienda.';
    links.push({label: 'Ver otros productos', url: cleanUrl('/tienda')});
  }
  else {
    reply = products.slice(0, limit).map(p => p.available ? `• ${p.name} cuesta ${p.price} y hay ${p.stock} ${p.stock === 1 ? 'unidad disponible' : 'unidades disponibles'}.` : `• ${p.name}: sin existencias registradas. Su precio es ${p.price}.`).join('\n');
    if (context.intent === 'catalog') reply = 'Estos son algunos productos de la tienda y sus precios:\n' + reply;
    if (budget != null) reply = `Opciones disponibles de hasta S/ ${budget.toFixed(2)}, de ${descending ? 'mayor a menor' : 'menor a mayor'} precio:\n` + reply;
    else if (ranked) reply = 'Opciones disponibles de ' + (descending ? 'mayor a menor' : 'menor a mayor') + ' precio:\n' + reply;
    if (products.length > limit || !ranked && (response.meta?.total || 0) > limit) reply += `\nPuede consultar el catálogo para ver más opciones.`;
    if (ranked && response.meta?.total > response.meta?.page_size) reply += '\nOrdené los resultados de la primera página.';
    if (context.shoppingCategory === 'alimentos' && !context.age && context.species && !context.catalogView) {
      refineBy = context.species === 'gato' ? 'cat-age' : 'dog-age';
      reply += context.species === 'gato' ? '\n¿Es gatito o adulto?' : '\n¿Es cachorro o adulto?';
    }
    if (response.meta?.catalog_is_example) reply += '\nProductos, precios y existencias de ejemplo.';
    links = products.slice(0, limit).map(p => ({ label: 'Ver ' + p.name, url: cleanUrl(p.url) })).filter(l => l.url);
  }
  if (context.intent === 'catalog') {
    links = links.slice(0, 4);
    links.push({ label: 'Ver catálogo completo', url: cleanUrl('/tienda') });
  }
  if (context.shoppingCategory) {
    refineBy ||= 'catalog';
    const query = $('Elegir qué buscar').first().json.path.split('?')[1] || '';
    const filters = [query, context.catalogView || ranked ? 'disponibles=1' : '', ranked ? 'sort=precio_' + (descending ? 'desc' : 'asc') : ''].filter(Boolean);
    links = links.slice(0, 4);
    links.push({ label: 'Ver resultados en la tienda', url: cleanUrl('/tienda' + (filters.length ? '?' + filters.join('&') : '')) });
  }
}
else reply = 'No entendí bien qué necesitas. ¿Buscas un producto, quieres saber qué servicios ofrecemos o necesitas separar una cita?';
if (context.intent === 'assistant_limits' && /^tel:\+?\d+$/.test(business?.phone_url || '')) {
  links.push({label: 'Llamar a BALTO', url: business.phone_url});
}
if (business && status === 200 && !['overview', 'assistant_ai', 'assistant_privacy', 'assistant_creator', 'acknowledgment'].includes(context.intent) && !context.urgent) {
  const appointment = ['appointment', 'parasite_care', 'pet_care'].includes(context.intent);
  let url = cleanUrl(appointment ? business.appointment_url || business.whatsapp_url : business.whatsapp_url, true);
  if (url && !appointment && ['product', 'category', 'delivery'].includes(context.intent)) {
    const message = context.intent === 'delivery' ? 'Hola, ¿hacen entregas a domicilio? Quisiera consultar cobertura y costo.'
      : `Hola, quisiera consultar por ${productContext.shoppingProduct || 'los productos de la tienda'}.`;
    url = url.split('?')[0] + '?text=' + encodeURIComponent(message);
  }
  if (url) links.push({ label: appointment ? 'Separar cita por WhatsApp' : 'Consultar por WhatsApp', url });
}
return [{ json: { status, facts, body: { reply, notFound: /^(?:No encontré|Por ahora no tenemos)/.test(reply), intent: context.intent, engine: context.engine, links, shoppingSpecies: ['shopping_advice', 'category'].includes(context.intent) ? context.species : '', shoppingCategory: context.shoppingCategory || '', shoppingBudget: context.shoppingBudget ?? null, refineBy, shoppingAge: context.age || '', ...productContext } } }];
