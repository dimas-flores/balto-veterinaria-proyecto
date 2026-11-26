#!/usr/bin/env python3
"""Genera el export importable; los secretos se asignan como credencial al arrancar."""
import json
import os
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
# IP pública de la demo en EC2. Al arrancar, n8n-prepare.cjs la cambia por la del .env.
ORIGIN = os.environ.get('BALTO_PUBLIC_ORIGIN', 'http://3.211.103.160').rstrip('/')
def code(name):
    return (ROOT/'n8n/code'/name).read_text().replace('__BALTO_ORIGIN__', ORIGIN)
nodes = []
def node(name, kind, parameters, version=1, **extra):
    nodes.append(dict(id=name, name=name, type=kind if kind.startswith('@') else 'n8n-nodes-base.'+kind, typeVersion=version, position=[len(nodes)*260, 300], parameters=parameters, **extra))
node('Recibir chat', 'webhook', {'httpMethod': 'POST', 'path': 'chat', 'responseMode': 'responseNode', 'options': {'allowedOrigins': ORIGIN}}, 2.1, webhookId='balto-chat-webhook')
node('¿Qué pregunta el cliente?', 'code', {'jsCode': code('detect.js')}, 2)
# Gemini interpreta la pregunta; Drupal conserva la autoridad sobre los datos.
def gemini(name, credential, label, *, content=None, prompt='gemini-prompt.txt', max_tokens=512, on_error='continueRegularOutput', **execution_options):
    # Nodo nativo de Gemini: n8n muestra su logo. Devuelve la respuesta cruda (simplify False).
    if content is None:
        content = """={{ JSON.stringify({
            pregunta: $("¿Qué pregunta el cliente?").first().json.message,
            conversacion: $("¿Qué pregunta el cliente?").first().json.conversation ?? [],
        }) }}"""
    node(name, '@n8n/n8n-nodes-langchain.googleGemini', {
        'resource': 'text', 'operation': 'message',
        'modelId': {'__rl': True, 'mode': 'list', 'value': 'models/gemini-3.5-flash-lite'},
        'messages': {'values': [{'role': 'user', 'content': content}]},
        'simplify': False, 'jsonOutput': True,
        'options': {
            'systemMessage': (ROOT/'n8n/code'/prompt).read_text().strip(),
            'temperature': 0, 'maxOutputTokens': max_tokens,
        },
    }, 1.2, credentials={'googlePalmApi': {'id': credential, 'name': label}}, onError=on_error, **execution_options)
# Si una clave falla (cuota o saturación), la salida de error pasa a la siguiente: sin nodos de comprobación.
gemini('Gemini principal', 'baltoGeminiApi', 'BALTO Gemini', on_error='continueErrorOutput', retryOnFail=True, maxTries=2, waitBetweenTries=1000)
gemini('Gemini de respaldo', 'baltoGeminiApi2', 'BALTO Gemini 2', on_error='continueErrorOutput')
gemini('Respaldo IA 3', 'baltoGeminiApi3', 'BALTO Gemini 3', on_error='continueErrorOutput')
node('Revisar qué pide el cliente', 'code', {'jsCode': code('gemini-validate.js')}, 2)
def http(name, url, *, timeout=8000):
    node(name, 'httpRequest', {'url': url, 'authentication': 'genericCredentialType', 'genericAuthType': 'httpHeaderAuth', 'options': {'timeout': timeout, 'response': {'response': {'responseFormat': 'json'}}}}, 4.2, credentials={'httpHeaderAuth': {'id': 'baltoDrupalApi', 'name': 'BALTO API interna'}}, onError='continueRegularOutput')
def condition(name, expression):
    node(name, 'if', {'conditions': {
        'options': {'typeValidation': 'strict', 'version': 2},
        'conditions': [{'id': name, 'leftValue': expression,
                        'operator': {'type': 'boolean', 'operation': 'true', 'singleValue': True}}],
        'combinator': 'and',
    }, 'options': {}}, 2.2)

condition('¿Hace falta Gemini?', '={{ $("¿Qué pregunta el cliente?").first().json.noAi !== true && ($("¿Qué pregunta el cliente?").first().json.intent === "unknown" || ($("Buscar producto inicial").isExecuted && Array.isArray($json.data) && $json.data.length === 0)) }}')
http('Buscar producto inicial', "={{ 'http://drupal/api/vet/products?q=' + encodeURIComponent($json.q) + ($json.species ? '&species=' + encodeURIComponent($json.species) : '') }}", timeout=5000)
node('Validar y dirigir', 'switch', {
    'mode': 'expression',
    'numberOutputs': 3,
    'output': '={{ $json.status !== 200 ? 0 : ($json.intent === "product" && $json.q ? 1 : 2) }}',
}, 3.2)
node('Consultar Drupal', 'executeWorkflow', {
    'source': 'database',
    'workflowId': {'__rl': True, 'mode': 'id', 'value': 'baltoDatosChat'},
    'mode': 'each',
    'options': {'waitForSubWorkflow': True},
}, 1.1)
response_parameters = {'respondWith': 'json', 'responseBody': '={{ $json.body ?? {reply: $json.status === 403 ? "Este chat solo está habilitado desde la página de BALTO." : "Escribe un mensaje de entre 1 y 500 caracteres.", intent: "unknown", engine: "rules", links: []} }}', 'options': {'responseCode': '={{ $json.status }}', 'responseHeaders': {'entries': [{'name': 'Cache-Control', 'value': 'no-store'}, {'name': 'X-Content-Type-Options', 'value': 'nosniff'}]}}}
node('Combinar respuestas', 'code', {'jsCode': code('combine.js')}, 2)
node('Enviar respuesta', 'respondToWebhook', response_parameters, 1.4)
# Después de responder al cliente, avisa al dueño de las preguntas que el chat no supo contestar.
condition('¿Sin respuesta?', '={{ $json.body?.notFound === true || ($json.body?.intent === "unknown" && $json.body?.reply?.startsWith("No pude interpretar su consulta")) }}')
node('Avisar pregunta sin respuesta', 'telegram', {
    'resource': 'message', 'operation': 'sendMessage', 'chatId': '__TELEGRAM_CHAT_ID__',
    'text': '={{ "❓ Pregunta sin respuesta en el chat:\n" + String($("Recibir chat").first().json.body?.message ?? "").slice(0, 200) }}',
    'replyMarkup': 'inlineKeyboard',
    'inlineKeyboard': {'rows': [{'row': {'buttons': [{'text': 'Marcar revisada', 'additionalFields': {'callback_data': 'revisada'}}]}}]},
    'additionalFields': {'appendAttribution': False},
}, 1.2, credentials={'telegramApi': {'id': 'baltoTelegram', 'name': 'BALTO Telegram'}}, onError='continueRegularOutput')
def routes(*targets):
    return {'main': [[{'node': target, 'type': 'main', 'index': 0}] for target in targets]}

main_path = [
    'Recibir chat', '¿Qué pregunta el cliente?', 'Validar y dirigir', '¿Hace falta Gemini?', 'Revisar qué pide el cliente',
    'Consultar Drupal', 'Combinar respuestas',
    'Enviar respuesta',
]
connections = {source: routes(target) for source, target in zip(main_path, main_path[1:])}
connections.update({
    'Validar y dirigir': routes('Enviar respuesta', 'Buscar producto inicial', '¿Hace falta Gemini?'),
    '¿Hace falta Gemini?': routes('Gemini principal', 'Revisar qué pide el cliente'),
    'Gemini principal': routes('Revisar qué pide el cliente', 'Gemini de respaldo'),
    'Gemini de respaldo': routes('Revisar qué pide el cliente', 'Respaldo IA 3'),
    'Respaldo IA 3': routes('Revisar qué pide el cliente', 'Revisar qué pide el cliente'),
    'Enviar respuesta': routes('¿Sin respuesta?'),
    '¿Sin respuesta?': routes('Avisar pregunta sin respuesta'),
    'Buscar producto inicial': routes('¿Hace falta Gemini?'),
})

positions = {name: [index * 155, 300] for index, name in enumerate(main_path)}
positions.update({
    'Gemini principal': [560, 15],
    'Gemini de respaldo': [810, 465],
    'Respaldo IA 3': [1190, 465],
    'Buscar producto inicial': [535, 125],
    '¿Sin respuesta?': [1240, 300],
    'Avisar pregunta sin respuesta': [1395, 300],
})
for item in nodes:
    item['position'] = positions[item['name']]

for name, title, description, x, y, width, color in [
    ('Entrada', '1. Recibir y validar', 'El webhook recibe la consulta.', -40, -115, 350, 7),
    ('Interpretación', '2. Entender la consulta', 'Reglas, Gemini y respaldo.', 325, -115, 435, 7),
    ('Datos de Drupal', '3. Consultar y responder', 'Drupal aporta los datos.', 775, -115, 335, 7),
]:
    node(name, 'stickyNote', {
        'content': f'## {title}\n{description}', 'width': width, 'height': 95, 'color': color,
    })
    nodes[-1]['position'] = [x, y]

workflow = {'id': 'baltoChatbot', 'name': 'BALTO · Chatbot web', 'active': False, 'nodes': nodes, 'connections': connections, 'settings': {'executionOrder': 'v1', 'saveDataSuccessExecution': 'none', 'saveDataErrorExecution': 'none', 'saveManualExecutions': False, 'executionTimeout': 55}, 'tags': []}
(ROOT/'n8n/workflows/chatbot.json').write_text(json.dumps(workflow, ensure_ascii=False, indent=2)+'\n')


nodes = []
node('Recibir consulta', 'executeWorkflowTrigger', {'inputSource': 'passthrough'}, 1.1)
http('Ver horarios y contacto', 'http://drupal/api/vet/schedule')
condition('¿Pidió un tipo de producto?', '={{ $("Recibir consulta").first().json.intent === "category" }}')
http('Leer categorías', 'http://drupal/api/vet/categories')
node('Elegir qué buscar', 'code', {'jsCode': code('plan.js')}, 2)
condition('¿Faltan datos?', '={{ $json.path !== "/api/vet/schedule" && !$json.reuseProduct }}')
http('Buscar en la tienda', "={{ 'http://drupal' + $json.path }}")
node('Asistente BALTO · Preparar respuesta', 'code', {'jsCode': code('format.js')}, 2)

condition('¿Redactar con Gemini?', '={{ $json.status === 200 && $("Recibir consulta").first().json.noAi !== true && !($json.body.intent === "services" && $("Recibir consulta").first().json.mentionsVaccination) && !["clinical","parasite_care","appointment","acknowledgment","order_status","payment_receipt","overview","product","category","catalog","off_topic","multiple_products","service_prices","assistant_ai","assistant_limits","assistant_privacy","assistant_creator"].includes($json.body.intent) }}')
draft_message = """={{ (() => {
    const prepared = $('Asistente BALTO · Preparar respuesta').first().json;
    const base = prepared.body;
    return JSON.stringify({
        pregunta: $('Recibir consulta').first().json.message,
        conversacion: $('Recibir consulta').first().json.conversation ?? [],
        intencion: base.intent,
        modo: ['identity', 'greeting', 'unknown', 'pet_care'].includes(base.intent) ? 'conversacion' : 'datos',
        respuestaBase: prepared.facts || base.reply,
    });
})() }}"""
gemini('Redactar con Gemini', 'baltoGeminiApi', 'BALTO Gemini',
       content=draft_message, prompt='gemini-redact.txt')
# Gemini redacta como una persona con los datos de Drupal; si falla o inventa cifras se devuelve el texto de Drupal.
node('Validar redacción principal', 'code', {'jsCode': code('gemini-redact.js')}, 2)
node('Devolver respuesta', 'code', {'jsCode': 'return [{json: $json.resultado ?? $json}];'}, 2)

data_path = [
    'Recibir consulta', 'Ver horarios y contacto', '¿Pidió un tipo de producto?',
    'Elegir qué buscar', '¿Faltan datos?', 'Asistente BALTO · Preparar respuesta',
]
connections = {source: routes(target) for source, target in zip(data_path, data_path[1:])}
connections.update({
    '¿Pidió un tipo de producto?': routes('Leer categorías', 'Elegir qué buscar'),
    'Leer categorías': routes('Elegir qué buscar'),
    '¿Faltan datos?': routes('Buscar en la tienda', 'Asistente BALTO · Preparar respuesta'),
    'Buscar en la tienda': routes('Asistente BALTO · Preparar respuesta'),
    'Asistente BALTO · Preparar respuesta': routes('¿Redactar con Gemini?'),
    '¿Redactar con Gemini?': routes('Redactar con Gemini', 'Devolver respuesta'),
    'Redactar con Gemini': routes('Validar redacción principal'),
    'Validar redacción principal': routes('Devolver respuesta'),
})
positions = {name: [index * 220, 300] for index, name in enumerate(data_path)}
positions.update({'Leer categorías': [550, 100], 'Buscar en la tienda': [990, 100],
                  '¿Redactar con Gemini?': [1320, 300], 'Redactar con Gemini': [1510, 100],
                  'Validar redacción principal': [1730, 100],
                  'Devolver respuesta': [2150, 300]})
for item in nodes:
    item['position'] = positions[item['name']]

data_workflow = {
    **workflow, 'id': 'baltoDatosChat', 'name': 'BALTO · Consultar Drupal y responder',
    'nodes': nodes, 'connections': connections,
    'settings': {**workflow['settings'], 'callerPolicy': 'workflowsFromSameOwner'},
}
(ROOT/'n8n/workflows/chat-datos.json').write_text(json.dumps(data_workflow, ensure_ascii=False, indent=2)+'\n')


nodes = []
node('Recibir fallo de n8n', 'errorTrigger', {})
node('Preparar aviso técnico', 'code', {'jsCode': code('workflow-error.js')}, 2)
node('Avisar fallo por Telegram', 'telegram', {
    'resource': 'message', 'operation': 'sendMessage', 'chatId': '__TELEGRAM_CHAT_ID__',
    'text': '={{ $json.text }}', 'additionalFields': {'appendAttribution': False},
}, 1.2, credentials={'telegramApi': {'id': 'baltoTelegram', 'name': 'BALTO Telegram'}})
for index, item in enumerate(nodes):
    item['position'] = [index * 245, 250]
error_workflow = {
    **workflow, 'id': 'baltoErroresChat', 'name': 'BALTO · Avisos de errores del chatbot',
    'nodes': nodes, 'connections': {
        'Recibir fallo de n8n': routes('Preparar aviso técnico'),
        'Preparar aviso técnico': routes('Avisar fallo por Telegram'),
    },
}
(ROOT/'n8n/workflows/chat-errores.json').write_text(json.dumps(error_workflow, ensure_ascii=False, indent=2)+'\n')
