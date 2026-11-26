const results = $input.all();
if (results.length === 1) return [{json: results[0].json}];
if (!results.length) return [];

const complete = results.map(item => item.json);
const successful = complete.filter(item => item.status === 200 && item.body?.reply);
if (!successful.length) return [{json: results[0].json}];

const combined = successful.find(item => item.body.intent === 'product') ?? successful[0];
const body = {...combined.body};
const uniqueLinks = new Map();
for (const item of successful) {
  for (const link of item.body.links ?? []) uniqueLinks.set(link.url, link);
}
body.reply = successful.map(item => item.body.reply).join('\n\n');
if (successful.length < complete.length) body.reply += '\n\nUna de las consultas no se pudo completar. Puede volver a enviarla por separado.';
body.links = [...uniqueLinks.values()].slice(0, 8);
body.notFound = successful.some(item => item.body.notFound === true);
if (successful.filter(item => item.body.intent === 'product').length > 1) {
  body.productSku = null;
  body.shoppingProduct = '';
}
return [{json:{status:200, body}}];
