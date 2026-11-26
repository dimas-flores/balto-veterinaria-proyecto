#!/usr/bin/env python3
"""Configuración de despliegue en un directorio temporal, sin tocar .env local."""
import json
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
ROOT=Path(__file__).resolve().parents[1]
results=[]
def check(ok,text):
    if not ok: raise AssertionError(text)
    results.append(text)
    print('OK:',text)
with tempfile.TemporaryDirectory(prefix='balto-aws-config-') as temporary:
    path=Path(temporary)
    (path/'scripts').mkdir()
    for name in ['init-env.py','configure-aws-env.py']:
        shutil.copy(ROOT/'scripts'/name,path/'scripts'/name)
    shutil.copy(ROOT/'.env.example',path/'.env.example')
    def run(*args):
        return subprocess.run(['python3',*map(str,args)],cwd=path,capture_output=True,text=True,check=True)
    def read():
        return dict(line.split('=',1) for line in (path/'.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
    run(path/'scripts/init-env.py')
    before=read()
    run(path/'scripts/configure-aws-env.py','--host','203.0.113.10')
    http=read()
    check(http['CHAT_WEBHOOK_URL']=='http://203.0.113.10/webhook/chat' and http['CHAT_ALLOWED_ORIGIN']=='http://203.0.113.10','IP pública y webhook bajo el mismo origen')
    run(path/'scripts/configure-aws-env.py','--host','balto.example.org','--https')
    https=read()
    check(https['BALTO_SITE_ADDRESS']=='balto.example.org' and https['DRUPAL_BASE_URL']=='https://balto.example.org','Dominio configurado para HTTPS automático')
    keys=[k for k in before if any(word in k for word in ['PASSWORD','API_KEY','HASH_SALT','ENCRYPTION_KEY'])]
    check(all(before[k]==https[k] for k in keys),'Cambiar URL conserva los secretos de la instalación')
    local=dict(line.split('=',1) for line in (ROOT/'.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
    check(all(before[k]!=local[k] for k in keys),'Una instalación nueva genera secretos distintos de desarrollo')
    check((path/'.env').stat().st_mode&0o777==0o600,'Archivo .env privado con permisos 0600')
    rejected=subprocess.run(['python3',str(path/'scripts/configure-aws-env.py'),'--host','example.org;evil'],capture_output=True)
    check(rejected.returncode!=0 and read()==https,'Host inválido rechazado sin modificar el entorno')
    config=subprocess.run(['docker','compose','--env-file',str(path/'.env'),'-f',str(ROOT/'docker-compose.yml'),'-f',str(ROOT/'deploy/docker-compose.aws.yml'),'config','--format','json'],capture_output=True,text=True,check=True)
    services=json.loads(config.stdout)['services']
    check(not services['drupal'].get('ports') and not services['mariadb'].get('ports'),'Drupal y MariaDB sin puertos publicados')
    check(all(p['host_ip']=='127.0.0.1' for p in services['n8n']['ports']),'Editor n8n limitado al loopback')
    check({p['published'] for p in services['proxy']['ports']}=={'80','443'},'Solo Caddy publica HTTP y HTTPS')
    check(services['drupal']['environment']['DRUPAL_REVERSE_PROXY']=='1','Drupal preparado para confiar en el proxy específico')
(ROOT/'docs/verificacion-fase-9-config.json').write_text(json.dumps({'date':datetime.now(timezone.utc).isoformat(),'results':results,'errors':[],'aws_instance_tested':False},ensure_ascii=False,indent=2)+'\n')
