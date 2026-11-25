#!/usr/bin/env python3
"""Configura la demo local para abrirla por la IP del equipo (no por localhost).

Uso:
  python3 scripts/configure-local-ip.py            # detecta la IP de la red
  python3 scripts/configure-local-ip.py --ip 192.168.1.50
  python3 scripts/configure-local-ip.py --localhost  # volver a solo este equipo

Solo cambia URL y puertos del .env; nunca toca contraseñas ni claves.
Después: docker compose up -d --force-recreate drupal n8n
"""
import argparse
import ipaddress
import os
from pathlib import Path
import socket

ROOT = Path(__file__).resolve().parents[1]


def detect_ip():
    # No envía datos: solo pregunta al sistema qué interfaz usaría para salir.
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        probe.connect(('192.0.2.1', 9))
        return probe.getsockname()[0]


def values_for(ip, drupal_port, n8n_port):
    if ip == 'localhost':
        site, hook, bind = f'http://localhost:{drupal_port}', f'http://localhost:{n8n_port}', '127.0.0.1'
        origins = [site]
        hosts = ['localhost', '127.0.0.1', 'drupal']
    else:
        site, hook, bind = f'http://{ip}:{drupal_port}', f'http://{ip}:{n8n_port}', '0.0.0.0'
        # Se acepta también localhost para probar desde el mismo equipo.
        origins = [site, f'http://localhost:{drupal_port}']
        hosts = [ip, 'localhost', '127.0.0.1', 'drupal']
    return {
        'BIND_ADDRESS': bind,
        'DRUPAL_BASE_URL': site,
        'DRUPAL_TRUSTED_HOSTS': ','.join(hosts),
        'CHAT_WEBHOOK_URL': hook + '/webhook/chat',
        'CHAT_ALLOWED_ORIGIN': ','.join(origins),
        'WEBHOOK_URL': hook + '/',
        'N8N_HOST': ip,
        'N8N_PROTOCOL': 'http',
        'N8N_EDITOR_BASE_URL': hook,
        'N8N_SECURE_COOKIE': 'false',
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--ip', help='IPv4 del equipo en la red (por defecto se detecta)')
    group.add_argument('--localhost', action='store_true', help='volver a la configuración solo local')
    args = parser.parse_args()

    target = ROOT / '.env'
    if not target.exists():
        parser.error('Primero ejecuta python3 scripts/init-env.py')
    lines = target.read_text().splitlines()
    current = dict(line.split('=', 1) for line in lines if '=' in line and not line.startswith('#'))
    drupal_port = current.get('DRUPAL_PORT', '8080')
    n8n_port = current.get('N8N_PORT', '5678')

    if args.localhost:
        ip = 'localhost'
    else:
        ip = args.ip or detect_ip()
        try:
            parsed = ipaddress.IPv4Address(ip)
        except ValueError:
            parser.error(f'IP inválida: {ip}')
        if parsed.is_loopback or parsed.is_unspecified:
            parser.error('Usa la IP de la red (ej. 192.168.x.x), no 127.0.0.1 ni 0.0.0.0.')

    values = values_for(ip, drupal_port, n8n_port)
    result = []
    for line in lines:
        key = line.partition('=')[0]
        result.append(f'{key}={values.pop(key)}' if key in values and not line.startswith('#') else line)
    result.extend(f'{key}={value}' for key, value in values.items())

    # Reemplazo atómico conservando permisos privados.
    temporary = target.with_name('.env.ip-tmp')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write('\n'.join(result) + '\n')
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)

    shown = 'localhost' if ip == 'localhost' else ip
    print(f'Tienda:      http://{shown}:{drupal_port}')
    print(f'Chat (n8n):  http://{shown}:{n8n_port}/webhook/chat')
    print(f'Editor n8n:  http://{shown}:{n8n_port}')
    print('Aplica el cambio con: docker compose up -d --force-recreate drupal n8n')
    if ip != 'localhost':
        print(f'Si hay cortafuegos, permite los puertos {drupal_port} y {n8n_port}/tcp.')


if __name__ == '__main__':
    main()
