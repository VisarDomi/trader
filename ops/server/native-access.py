#!/usr/bin/env python3
"""Provision a dedicated native device key; expose only its authenticated, exact API paths."""
import argparse,base64,hashlib,json,os,secrets,subprocess,urllib.request,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
PRIVATE=ROOT/'apps/ios/Private'
PAIRING=PRIVATE/'primary-phone.json'
UI=Path.home()/'.local/share/hetzner-pc/mirror/home/erdal/trader-ui'
RESOURCES=['leaderboard','agents','agent','run','broker','status','graveyard','journal','research','mirror','exclude']
SITE='trader.veron3.space'

def private_write(path,data):
 path.parent.mkdir(parents=True,exist_ok=True)
 temporary=path.with_name(path.name+'.pending')
 fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
 with os.fdopen(fd,'wb') as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())
 os.replace(temporary,path);path.chmod(0o600)

def credentials():
 if not PAIRING.exists():private_write(PAIRING,json.dumps({'serverURL':'https://'+SITE,'token':secrets.token_urlsafe(32)}).encode())
 value=json.loads(PAIRING.read_text())
 if value.get('serverURL')!='https://'+SITE or len(value.get('token',''))<40:raise SystemExit('Invalid private pairing configuration')
 return value

def prepare():
 value=credentials();path=UI/'.env'
 if not path.exists():raise SystemExit('Active Trader UI environment is missing')
 key='TRADER_NATIVE_ACCESS_SHA256'
 lines=[line for line in path.read_text().splitlines() if not line.startswith(key+'=')]
 lines.append(key+'='+hashlib.sha256(value['token'].encode()).hexdigest())
 private_write(path,('\n'.join(lines)+'\n').encode())
 print('Prepared private device pairing and the dedicated server credential hash.')

def edge():
 value=credentials()
 req=urllib.request.Request('http://127.0.0.1:10003/api/native/v1/agents',headers={'Authorization':'Bearer '+value['token']})
 with urllib.request.urlopen(req,timeout=25) as response:
  if response.status!=200:raise SystemExit('Native API must pass its local authenticated check first')
 before=subprocess.run(['ssh','erdal@157.90.28.14','sudo -n cat /etc/caddy/Caddyfile'],check=True,capture_output=True).stdout
 text=before.decode();start=text.find(SITE+' {')
 if start<0:raise SystemExit('Trader edge block not found')
 depth=0;end=None
 for i in range(start,len(text)):
  depth+=(text[i]=='{')-(text[i]=='}')
  if i>start and depth==0 and '}' in text[start:i+1]:end=i+1;break
 if end is None:raise SystemExit('Unbalanced Trader block')
 old=text[start:end]
 if '127.0.0.1:18080' not in old or 'import authelia' not in old:raise SystemExit('Unexpected Trader edge routing; nothing changed')
 paths=' '.join('/api/native/v1/'+r for r in RESOURCES)
 new=f'''{SITE} {{
    route {{
        # Native access is authenticated by Trader's dedicated device key, never by a public bypass.
        @trader_native path {paths}
        handle @trader_native {{
            reverse_proxy 127.0.0.1:18080
        }}
        handle {{
            import authelia
            reverse_proxy 127.0.0.1:18080
        }}
    }}
}}'''
 after=(text[:start]+new+text[end:]).encode()
 private_write(PRIVATE/'edge-before-native.Caddyfile',before)
 payload=base64.b64encode(after).decode();expected=hashlib.sha256(before).hexdigest();suffix=uuid.uuid4().hex
 program=f'''import base64,hashlib,os,subprocess
from pathlib import Path
p=Path('/etc/caddy/Caddyfile');old=p.read_bytes()
assert hashlib.sha256(old).hexdigest()=={expected!r},'Edge changed concurrently; retry from current configuration'
t=p.with_name('.trader-native-{suffix}.Caddyfile');t.write_bytes(base64.b64decode({payload!r}));t.chmod(p.stat().st_mode & 0o777)
try:
 r=subprocess.run(['caddy','validate','--config',str(t),'--adapter','caddyfile'],capture_output=True)
 if r.returncode:raise RuntimeError('Native edge validation failed; original configuration retained')
 assert hashlib.sha256(p.read_bytes()).hexdigest()=={expected!r},'Edge changed during validation'
 os.replace(t,p)
 r=subprocess.run(['systemctl','reload','caddy'],capture_output=True)
 if r.returncode:
  t.write_bytes(old);t.chmod(p.stat().st_mode & 0o777);os.replace(t,p)
  subprocess.run(['systemctl','reload','caddy'],check=True,capture_output=True)
  raise RuntimeError('Native reload failed; original configuration restored')
finally:t.unlink(missing_ok=True)
print('Validated and reloaded only the Trader edge route.')
'''
 subprocess.run(['ssh','erdal@157.90.28.14','sudo -n python3 -'],input=program.encode(),check=True)
 private_write(Path.home()/'.local/share/hetzner-pc/config/edge.Caddyfile',after)

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['prepare','edge']);args=p.parse_args()
 (prepare if args.action=='prepare' else edge)()
