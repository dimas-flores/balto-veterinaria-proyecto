const event = $input.first().json;
const execution = event.execution || {};
const node = execution.lastNodeExecuted || event.trigger?.error?.node?.name || 'disparador no identificado';
const label = String(node).replace(/[^\p{L}\p{N} .¿?_-]/gu, '').slice(0, 80);
const id = /^\d+$/.test(String(execution.id ?? '')) ? String(execution.id) : 'sin registro';
const cause = /timeout|timed out/i.test(String(execution.error?.name || '') + ' ' + String(execution.error?.message || ''))
  ? 'Tiempo de espera agotado'
  : 'Error de ejecución';
return [{json: {text: [
  'BALTO · Fallo del chatbot',
  'Motivo: ' + cause,
  'Nodo: ' + label,
  'Ejecución: ' + id,
].join('\n')}}];
