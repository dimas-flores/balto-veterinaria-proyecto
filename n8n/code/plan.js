const context = $('Recibir consulta').first().json;
const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
let path = '/api/vet/schedule';
if (['services', 'overview'].includes(context.intent)) path = '/api/vet/services';
else if (context.intent === 'categories') path = '/api/vet/categories';
else if (context.intent === 'category') {
  const data = $input.first().json.data;
  const categories = Array.isArray(data) ? data : [];
  // El identificador se obtiene de Drupal, nunca se presupone el ID de taxonomía.
  const category = categories.find(c => normalize(c.name).split(/[^a-z]+/).filter(w => w.length > 4).some(w => (context.shoppingCategory || context.text).includes(w) || (context.shoppingCategory || context.text).includes(w.replace(/s$/, ''))));
  const filters = [];
  if (category) filters.push('category=' + encodeURIComponent(category.id));
  const search = [context.age, context.size].filter(Boolean).join(' ');
  if (search) filters.push('q=' + encodeURIComponent(search));
  if (context.species) filters.push('species=' + encodeURIComponent(context.species));
  path = '/api/vet/products' + (filters.length ? '?' + filters.join('&') : '');
}
else if (context.intent === 'product') path = '/api/vet/products?q=' + encodeURIComponent(context.q);
const reuseProduct = Boolean(context.initialProduct);
return [{ json: { ...context, path, reuseProduct } }];
