#!/usr/bin/env python3
"""Guarded offline QA of the server-built screens on the Mac's shared virtual iPhone. No phone, credentials or
broker mutations.

  mac-workload simulator --visible --device UUID --timeout 600 -- \
    /usr/bin/python3 check-simulator.py --device UUID --fixture /tmp/trader-v2-fixture.json

The fixture comes from screen-fixture.py (the live v2 screens as the phone would store them). It is seeded into
the QA app's trader.sqlite; the app then runs offline against an invalid test-only server, so every screen is
the stored copy. Checks: each screen opens with its rows, visible content, portrait/landscape, the `visar` search,
long trade-list scrolling, and exact cold/warm first-frame restoration. Screenshots go to /tmp/trader-native-qa.
"""
import argparse,json,sqlite3,subprocess,time,urllib.parse,urllib.request
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--device',required=True);p.add_argument('--fixture',required=True);a=p.parse_args()
OUT=Path('/tmp/trader-native-qa');OUT.mkdir(exist_ok=True)
ROOT=Path(__file__).resolve().parents[1];TOOLS=Path.home()/'Developer/ios-tools/native/scripts'
APPLE=str(TOOLS/'apple-tool');BUNDLE='com.visar.Trader.qa'
subprocess.run([str(TOOLS/'mac-workload'),'assert-simulator','--device',a.device],check=True)
fixture=json.loads(Path(a.fixture).read_text());issues=[]
def command(*args,**kw):return subprocess.run([APPLE,'simctl',*args],check=True,**kw)
def hook(path,**params):
    with urllib.request.urlopen('http://127.0.0.1:8765/'+path+('?'+urllib.parse.urlencode(params) if params else ''),timeout=10) as r:return json.load(r)
def state():return hook('state').get('trader',{})
def wait(screen,rows=1):
    s={}
    for _ in range(60):
        try:
            s=state()
            if s.get('screen')==screen and s.get('rows',0)>=rows:return s
        except Exception:pass
        time.sleep(.3)
    shot('failed-'+screen);raise RuntimeError('Screen did not settle: '+screen+' '+str(s))
def shot(name):
    command('io',a.device,'screenshot',str(OUT/(name+'.png')),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    (OUT/(name+'.json')).write_text(json.dumps(hook('layout')))
def orient(value):
    hook('action',name='orientation',value=value)
    for _ in range(40):
        time.sleep(.2);s=state()
        if (s['width']>s['height'])==(value=='landscape'):return s
    raise RuntimeError('Orientation did not settle')
def layout():return hook('layout')['layout']
def scan(prefix,terms,pages=14,shots=(0,1,2,3,5)):
    seen=''
    for i in range(pages):
        hook('scroll',y=i*600);time.sleep(.2);seen+=json.dumps(layout(),ensure_ascii=False)
        if i in shots:shot(f'{prefix}-{i}')
    for term in terms:
        if term not in seen:issues.append(f'{prefix}: missing visible content: {term}')
    hook('action',name='top');time.sleep(.2)
def same(before,after):
    keys=lambda items:sorted([(x['kind'],tuple(x['frame']),x.get('text'),x.get('shown')) for x in items],key=repr)
    return keys(before)==keys(after)
installed=False
try:
    command('install',a.device,str(ROOT/'build/Release-iphonesimulator/Trader.app'),timeout=240);installed=True
    container=Path(subprocess.check_output([APPLE,'simctl','get_app_container',a.device,BUNDLE,'data'],text=True).strip())
    target=container/'Library/Application Support/Trader';target.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(target/'trader.sqlite')
    db.executescript('PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS screen(key TEXT PRIMARY KEY,rev TEXT NOT NULL,fetched REAL NOT NULL,body BLOB NOT NULL) WITHOUT ROWID;CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value BLOB NOT NULL) WITHOUT ROWID;')
    now=time.time()*1000
    db.executemany('INSERT OR REPLACE INTO screen(key,rev,fetched,body) VALUES(?,?,?,?)',[(s['key'],s['rev'],now,s['body'].encode()) for s in fixture['screens']])
    db.commit();db.close()
    (target/'simulator-credential.json').write_text(json.dumps({'serverURL':'https://trader.invalid','token':'fixture-only-offline-credential-000000000000'}))
    (target/'simulator-credential.json').chmod(0o600)
    command('launch',a.device,BUNDLE,stdout=subprocess.DEVNULL)
    wait('rankings',100);hook('action',name='offline',value='true');orient('portrait');shot('rankings-portrait')
    hook('action',name='search',query='visar')
    for _ in range(40):
        time.sleep(.3);s=state()
        if s.get('rows',0)<100:break
    if not 15<=s.get('rows',0)<=40:issues.append(f"visar search shows {s.get('rows')} rows")
    shot('rankings-visar');hook('action',name='search',query='');time.sleep(.4)
    for item in fixture['open']:
        name=item['screen']+'-'+item['id'].split(':')[1 if item['id'].startswith('demo:') else 0].replace('/','_')
        hook('action',name='open',screen=item['screen'],id=item['id'],stage=item.get('stage','capital'),version=item.get('version',''))
        wait(item['screen'],item['rows']);time.sleep(.5);shot(name+'-top')
        scan(name,item['terms'],pages=40 if item['rows']>=50 else 14)
        if item['screen']=='trade':orient('landscape');time.sleep(.6);shot(name+'-landscape');orient('portrait')
    # Cold and warm restoration of a scrolled trade screen, first frame included.
    night=next(i for i in fixture['open'] if i['screen']=='trade')
    hook('action',name='open',screen='trade',id=night['id'],stage=night['stage'],version=night['version']);wait('trade',night['rows'])
    hook('scroll',y=700);time.sleep(.6);before=layout();shot('restore-before')
    command('launch',a.device,'com.apple.Preferences',stdout=subprocess.DEVNULL);time.sleep(1)
    command('terminate',a.device,BUNDLE,stdout=subprocess.DEVNULL)
    command('launch',a.device,BUNDLE,stdout=subprocess.DEVNULL);wait('trade',night['rows']);time.sleep(6)
    samples=hook('timeline')['timeline']
    (OUT/'restore-timeline.json').write_text(json.dumps(samples));shot('restore-after')
    if not samples or samples[0]['sinceFirstFrame']!=0:issues.append('No first-frame sample')
    elif not same(before,samples[0]['layout']):issues.append('Cold first-frame layout changed')
    elif not all(same(before,x['layout']) for x in samples):issues.append('Cold restore later changed')
    before=layout();command('launch',a.device,'com.apple.Preferences',stdout=subprocess.DEVNULL);time.sleep(1)
    command('launch',a.device,BUNDLE,stdout=subprocess.DEVNULL);time.sleep(1.5)
    if not same(before,layout()):issues.append('Warm return changed')
    print('ISSUES: '+'; '.join(issues) if issues else 'PASS: v2 screens offline, visar search, trade charts, portrait/landscape, long trade list, exact cold/warm restore',flush=True)
finally:
    if installed:
        subprocess.run([APPLE,'simctl','terminate',a.device,BUNDLE],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        command('uninstall',a.device,BUNDLE)
