#!/usr/bin/env python3
"""Pruebas contra el webhook n8n publicado y su API Drupal real."""
import json
import os
from pathlib import Path
import subprocess
import urllib.request
import urllib.error
from datetime import datetime, timezone
from decimal import Decimal

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('BALTO_CHAT_URL', 'http://localhost:5678/webhook/chat')
ORIGIN = os.environ.get('BALTO_SITE_ORIGIN', 'http://localhost:8080')
DOCKER = ['docker']
if not os.environ.get('DOCKER_HOST') and Path('/run/user/1000/balto-docker.sock').exists():
    DOCKER += ['--host=unix:///run/user/1000/balto-docker.sock']
results = []

def check(ok, message):
    if not ok:
        raise AssertionError(message)
    results.append(message)
    print('OK:', message, flush=True)

def chat(message, origin=ORIGIN):
    req = urllib.request.Request(BASE, data=json.dumps({'message':message}).encode(), headers={'Content-Type':'application/json', 'Origin':origin}, method='POST')
    try:
        response = urllib.request.urlopen(req, timeout=40)
    except urllib.error.HTTPError as error:
        response = error
    body = json.loads(response.read())
    return response.status, body, response.headers

def php(code):
    output = subprocess.run(DOCKER + ['compose','exec','-T','drupal','drush','php:eval',code], cwd=ROOT, text=True, capture_output=True, check=True)
    return output.stdout.strip()

baseline = json.loads(php('$v=\\Drupal::entityTypeManager()->getStorage("commerce_product_variation")->loadByProperties(["sku"=>"BAL-ALI-001"]);$v=reset($v);echo json_encode(\\Drupal::service("vet_api.catalog")->present($v->getProduct()));'))
samples = [
    ('hola', 'greeting', ['BALTO', 'productos']),
    ('¿Cuánto cuesta el Dog Chow Adulto 15 kg?', 'product', [baseline['price'], str(baseline['stock'])+' unidades']),
    ('disponibilidad de BAL-ALI-004', 'product', ['agotado']),
    ('precio de producto INEXISTENTEZZZ', 'product', ['No encontré', 'WhatsApp']),
    ('categorías', 'categories', ['Alimentos', 'Accesorios', 'Juguetes']),
    ('juguetes', 'category', ['Pelota', 'S/']),
    ('servicios', 'services', ['Rayos X', 'Ecografía', 'Cirugías', 'Laboratorio', '24 horas']),
    ('horarios', 'schedule', ['24 horas', '9:00', '7:00']),
    ('direcciones', 'schedule', ['220', 'Centro Comercial']),
    ('quiero separar una cita', 'schedule', ['WhatsApp', '986']),
    ('asdfgh zxcv', 'unknown', ['Puedo ayudarte', 'WhatsApp']),
]
for message,intent,fragments in samples:
    status,body,headers = chat(message)
    check(status == 200 and body['intent'] == intent, 'Intención correcta: '+message)
    check(all(fragment.lower() in body['reply'].lower() for fragment in fragments), 'Respuesta en español con datos esperados: '+message)
    check(headers.get('Access-Control-Allow-Origin') == ORIGIN and 'no-store' in headers.get('Cache-Control',''), 'CORS y caché: '+message)
    check(any(link['url'].startswith('https://wa.me/51986866036') for link in body['links']), 'Contacto real desde Drupal: '+message)
status,body,_ = chat('precio de Dog Chow')
check(any(link['url'].startswith(ORIGIN+'/product/') for link in body['links']), 'Enlace público al detalle para agregar al carrito')
for value in ['', None, [], {}, 23, 'a'*501]:
    status,body,_ = chat(value)
    check(status == 400 and '500' in body['reply'], 'Rechazo de mensaje inválido: '+type(value).__name__)
status,body,headers = chat('hola', 'https://sitio-no-autorizado.invalid')
check(status == 403 and body['links'] == [], 'Origen ajeno rechazado por el workflow')
check(headers.get('Access-Control-Allow-Origin') != 'https://sitio-no-autorizado.invalid', 'CORS no autoriza el origen ajeno')
req = urllib.request.Request(BASE, headers={'Origin':ORIGIN,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}, method='OPTIONS')
with urllib.request.urlopen(req, timeout=15) as response:
    check(response.status == 204 and response.headers.get('Access-Control-Allow-Origin') == ORIGIN, 'Preflight del navegador permitido')
    check('content-type' in response.headers.get('Access-Control-Allow-Headers','').lower(), 'Preflight permite Content-Type JSON')
# Misma ruta de persistencia que usa el formulario administrativo; no reconstruye caches.
lookup = '$v=\\Drupal::entityTypeManager()->getStorage("commerce_product_variation")->loadByProperties(["sku"=>"BAL-ALI-001"]);$v=reset($v);'
original = str(Decimal(php(lookup+'echo $v->getPrice()->getNumber();')))
try:
    php(lookup+'$v->setPrice(new \\Drupal\\commerce_price\\Price("190.50","PEN"));$v->save();')
    status,body,_ = chat('precio de Dog Chow')
    check(status == 200 and '190.50' in body['reply'], 'Cambio de precio en Drupal reflejado en chat sin reiniciar n8n')
finally:
    php(lookup+'$v->setPrice(new \\Drupal\\commerce_price\\Price("'+original+'","PEN"));$v->save();')
status,body,_ = chat('precio de Dog Chow')
check(status == 200 and baseline['price'] in body['reply'], 'Precio original restaurado y visible en chat')
# El stock refleja el saldo tras las compras anteriores, no datos escritos en el workflow.
lookup_ball = '$v=\\Drupal::entityTypeManager()->getStorage("commerce_product_variation")->loadByProperties(["sku"=>"BAL-JUG-001"]);$v=reset($v);'
stock = php(lookup_ball+'echo \\Drupal::service("vet_api.catalog")->stock($v);')
_,body,_ = chat('precio de pelota')
check(stock+' unidades' in body['reply'], 'Chat refleja existencias del libro de Commerce Stock')
(ROOT/'docs/verificacion-fase-6-chat.json').write_text(json.dumps({'date':datetime.now(timezone.utc).isoformat(),'results':results,'errors':[]},ensure_ascii=False,indent=2)+'\n')
print(f'{len(results)} comprobaciones correctas.',flush=True)
