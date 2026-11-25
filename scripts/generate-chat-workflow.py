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
def gemini(name, credential, label):
    # Los respaldos se conservan al arrancar si tienen una credencial o modelo distinto.
    node(name, '@n8n/n8n-nodes-langchain.googleGemini', {
        'resource': 'text', 'operation': 'message',
        'modelId': {'__rl': True, 'mode': 'list', 'value': 'models/gemini-3.5-flash-lite'},
        'messages': {'values': [{'role': 'user', 'content': '={{ $("Recibir chat").first().json.body.message }}'}]},
        'simplify': False, 'jsonOutput': True,
        'options': {
            'systemMessage': (ROOT/'n8n/code/gemini-prompt.txt').read_text().strip(),
            'temperature': 0, 'maxOutputTokens': 256,
        },
    }, 1.2, credentials={'googlePalmApi': {'id': credential, 'name': label}}, onError='continueRegularOutput')
gemini('Gemini principal', 'baltoGeminiApi', 'BALTO Gemini')
gemini('Gemini de respaldo', 'baltoGeminiApi2', 'BALTO Gemini 2')
gemini('Respaldo IA 3', 'baltoGeminiApi3', 'BALTO Gemini 3')
node('Revisar qué pide el cliente', 'code', {'jsCode': code('gemini-validate.js')}, 2)
def http(name, url):
    node(name, 'httpRequest', {'url': url, 'authentication': 'genericCredentialType', 'genericAuthType': 'httpHeaderAuth', 'options': {'timeout': 8000, 'response': {'response': {'responseFormat': 'json'}}}}, 4.2, credentials={'httpHeaderAuth': {'id': 'baltoDrupalApi', 'name': 'BALTO API interna'}}, onError='continueRegularOutput')
def condition(name, expression):
    node(name, 'if', {'conditions': {
        'options': {'typeValidation': 'strict', 'version': 2},
        'conditions': [{'id': name, 'leftValue': expression,
                        'operator': {'type': 'boolean', 'operation': 'true', 'singleValue': True}}],
        'combinator': 'and',
    }, 'options': {}}, 2.2)

condition('¿Hace falta Gemini?', '={{ $("¿Qué pregunta el cliente?").first().json.intent === "unknown" || ($("Buscar producto inicial").isExecuted && Array.isArray($json.data) && $json.data.length === 0) }}')
condition('¿IA 1 respondió?', '={{ $json.candidates?.[0]?.finishReason === "STOP" }}')
condition('¿IA 2 respondió?', '={{ $json.candidates?.[0]?.finishReason === "STOP" }}')
http('Buscar producto inicial', "={{ 'http://drupal/api/vet/products?q=' + encodeURIComponent($json.q) }}")
node('Validar y dirigir', 'switch', {
    'mode': 'expression',
    'numberOutputs': 3,
    'output': '={{ $json.status !== 200 ? 0 : ($json.intent === "product" && $json.q ? 1 : 2) }}',
}, 3.2)
node('Consultar Drupal y preparar respuesta', 'executeWorkflow', {
    'source': 'database',
    'workflowId': {'__rl': True, 'mode': 'id', 'value': 'baltoDatosChat'},
    'mode': 'once',
    'options': {'waitForSubWorkflow': True},
}, 1.1)
response_parameters = {'respondWith': 'json', 'responseBody': '={{ $json.body ?? {reply: $json.status === 403 ? "Este chat solo está habilitado desde la página de BALTO." : "Escribe un mensaje de entre 1 y 500 caracteres.", intent: "unknown", engine: "rules", links: []} }}', 'options': {'responseCode': '={{ $json.status }}', 'responseHeaders': {'entries': [{'name': 'Cache-Control', 'value': 'no-store'}, {'name': 'X-Content-Type-Options', 'value': 'nosniff'}]}}}
node('Enviar respuesta', 'respondToWebhook', response_parameters, 1.4)
def routes(*targets):
    return {'main': [[{'node': target, 'type': 'main', 'index': 0}] for target in targets]}

main_path = [
    'Recibir chat', '¿Qué pregunta el cliente?', 'Validar y dirigir', '¿Hace falta Gemini?', 'Revisar qué pide el cliente',
    'Consultar Drupal y preparar respuesta',
    'Enviar respuesta',
]
connections = {source: routes(target) for source, target in zip(main_path, main_path[1:])}
connections.update({
    'Validar y dirigir': routes('Enviar respuesta', 'Buscar producto inicial', '¿Hace falta Gemini?'),
    '¿Hace falta Gemini?': routes('Gemini principal', 'Revisar qué pide el cliente'),
    'Gemini principal': routes('¿IA 1 respondió?'),
    '¿IA 1 respondió?': routes('Revisar qué pide el cliente', 'Gemini de respaldo'),
    'Gemini de respaldo': routes('¿IA 2 respondió?'),
    '¿IA 2 respondió?': routes('Revisar qué pide el cliente', 'Respaldo IA 3'),
    'Respaldo IA 3': routes('Revisar qué pide el cliente'),
    'Buscar producto inicial': routes('¿Hace falta Gemini?'),
})

positions = {name: [index * 155, 300] for index, name in enumerate(main_path)}
positions.update({
    'Gemini principal': [560, 15],
    '¿IA 1 respondió?': [620, 465],
    'Gemini de respaldo': [810, 465],
    '¿IA 2 respondió?': [1000, 465],
    'Respaldo IA 3': [1190, 465],
    'Buscar producto inicial': [535, 125],
})
for item in nodes:
    item['position'] = positions[item['name']]

for name, title, description, x, y, width, color in [
    ('Entrada', '1. Recibir y validar', 'El webhook recibe la consulta.', -40, -115, 350, 7),
    ('Interpretación', '2. Entender la consulta', 'Reglas, Gemini y respaldo.', 325, -115, 435, 7),
    ('Datos de Drupal', '3. Consultar y responder', 'Drupal aporta los datos. n8n devuelve la respuesta.', 775, -115, 260, 7),
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
})
positions = {name: [index * 220, 300] for index, name in enumerate(data_path)}
positions.update({'Leer categorías': [550, 100], 'Buscar en la tienda': [990, 100]})
for item in nodes:
    item['position'] = positions[item['name']]

data_workflow = {
    **workflow, 'id': 'baltoDatosChat', 'name': 'BALTO · Consultar Drupal y responder',
    'nodes': nodes, 'connections': connections,
    'settings': {**workflow['settings'], 'callerPolicy': 'workflowsFromSameOwner'},
}
(ROOT/'n8n/workflows/chat-datos.json').write_text(json.dumps(data_workflow, ensure_ascii=False, indent=2)+'\n')
