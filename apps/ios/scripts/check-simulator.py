#!/usr/bin/env python3
"""Run on the Mac after installing Trader in one booted iPhone simulator. Never invokes a demo mutation."""
import argparse,json,subprocess,time,urllib.parse,urllib.request
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--device',required=True);a=p.parse_args()
OUT=Path('/tmp/trader-native-qa');OUT.mkdir(exist_ok=True)
def hook(path,**params):
 url='http://127.0.0.1:8765/'+path+('?' + urllib.parse.urlencode(params) if params else '')
 with urllib.request.urlopen(url,timeout=10) as r:return json.load(r)
def wait(screen,rows=1):
 for _ in range(40):
  s=hook('state').get('trader',{})
  if s.get('screen')==screen and s.get('rows',0)>=rows and (s.get('refreshed',0)>0 or screen=='more'):return s
  time.sleep(.5)
 raise RuntimeError('Screen did not settle: '+screen+' '+str(s))
def shot(name):
 subprocess.run(['xcrun','simctl','io',a.device,'screenshot',str(OUT/(name+'.png'))],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 (OUT/(name+'.json')).write_text(json.dumps(hook('layout')))
def orient(value):
 hook('action',name='orientation',value=value)
 for _ in range(30):
  time.sleep(.3);s=hook('state')['trader']
  if (s['width']>s['height'])==(value=='landscape'):return s
 raise RuntimeError('Orientation did not settle: '+str(s))

for _ in range(60):
 try:hook('state');break
 except Exception:time.sleep(.5)
else:raise RuntimeError('Simulator test hooks did not start')
hook('action',name='tab',index=0);time.sleep(.5)
for _ in range(10):
 if hook('state')['trader']['screen']=='rankings':break
 hook('back');time.sleep(.3)
orient('portrait');wait('rankings',400);hook('action',name='top');time.sleep(.3);shot('rankings-portrait')
state=orient('landscape');shot('rankings-landscape');print('Rankings landscape geometry',state['width'],state['height'],flush=True)
orient('portrait')
container=Path(subprocess.check_output(['xcrun','simctl','get_app_container',a.device,'com.visar.Trader.paid','data'],text=True).strip())
responses=json.loads((container/'Library/Application Support/Trader/responses.json').read_text())
runs=responses['leaderboard?stage=capital']['value']
run=next((r for r in runs if r.get('slug')=='visar-night-trading'),runs[0])
hook('action',name='open',screen='run',id=run['runId'],stage='capital');wait('run',5);shot('run-portrait')
orient('landscape');shot('run-landscape');orient('portrait')
hook('action',name='tab',index=1);wait('agents',50);shot('agents-portrait')
hook('action',name='tab',index=2);wait('accounts',10);shot('accounts-portrait')
orient('landscape');shot('accounts-landscape');orient('portrait')
hook('action',name='tab',index=3);time.sleep(.4)
for _ in range(12):
 if hook('state')['trader']['screen']=='more':break
 hook('back');time.sleep(.3)
wait('more',5)
for screen in ['status','scenarios','graveyard','journal','research']:
 hook('action',name='open',screen=screen);s=wait(screen,4);shot(screen+'-portrait');print(screen,s['rows'],'rows',flush=True)
 if screen in ['graveyard','journal']:
  orient('landscape');shot(screen+'-landscape');orient('portrait')
 hook('back');time.sleep(.3)
hook('action',name='open',screen='graveyard');wait('graveyard',30)
responses=json.loads((container/'Library/Application Support/Trader/responses.json').read_text())
entry=responses['graveyard']['value']['entries'][0]
hook('action',name='open',screen='archive',id=entry['key']);wait('archive',1);shot('archive-portrait')
hook('action',name='open',screen='source',id=entry['agentId'],version=entry['codeHash']);wait('source',1)
assert entry['codeHash'] in json.dumps(hook('layout'))
shot('source-portrait')
hook('action',name='offline',value='true');time.sleep(.2);hook('action',name='refresh');time.sleep(.6)
assert hook('state')['trader']['rows']>0
shot('offline-source')
hook('action',name='offline',value='false')
hook('scroll',y=420);time.sleep(.6)
(OUT/'before-restore.json').write_text(json.dumps(hook('state')))
print('Native screens, both interface orientations, exact archived source and offline content verified.',flush=True)
