#!/usr/bin/env python3
"""Guarda la clave de Gemini mediante un prompt oculto; nunca la imprime."""
import argparse
import getpass
import os
from pathlib import Path
import re
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--env', default='.env')
parser.add_argument('--model', default='gemini-3.5-flash-lite')
args = parser.parse_args()
path = Path(args.env).resolve()
if not path.is_file():
    parser.error('Primero crea el archivo .env del proyecto.')
if not re.fullmatch(r'[a-z0-9.-]+', args.model):
    parser.error('Modelo inválido.')
key = getpass.getpass('Clave API de Gemini (entrada oculta): ').strip()
if len(key) < 20 or not re.fullmatch(r'[A-Za-z0-9_.-]+', key):
    parser.error('La clave no tiene un formato válido.')
updates = {'GEMINI_ENABLED': 'true', 'GEMINI_API_KEY': key, 'GEMINI_MODEL': args.model}
lines = [line for line in path.read_text().splitlines() if line.split('=', 1)[0] not in updates]
lines += [f'{name}={value}' for name, value in updates.items()]
fd, temporary = tempfile.mkstemp(prefix='.gemini-', dir=path.parent)
try:
    with os.fdopen(fd, 'w') as stream:
        stream.write('\n'.join(lines) + '\n')
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
print('Clave guardada con permisos privados. Reinicia n8n para activarla.')
