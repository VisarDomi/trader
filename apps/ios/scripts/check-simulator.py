#!/usr/bin/env python3
"""Guarded fixture QA for the native trade inspector. No phone, credentials or broker mutations.

Run via mac-workload simulator --visible --device UUID --timeout 600 -- ...
--fixture accepts a private {runId,responses} derived-response fixture (never raw ticks).
"""
import argparse,json,subprocess,time,urllib.parse,urllib.request
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--device',required=True);p.add_argument('--fixture',required=True);p.add_argument('--restore-only',action='store_true');p.add_argument('--strategy',action='store_true');a=p.parse_args()
OUT=Path('/tmp/trader-native-qa');OUT.mkdir(exist_ok=True)
ROOT=Path(__file__).resolve().parents[1];TOOLS=Path.home()/'Developer/ios-tools/native/scripts'
APPLE=str(TOOLS/'apple-tool');BUNDLE='com.visar.Trader.qa'
subprocess.run([str(TOOLS/'mac-workload'),'assert-simulator','--device',a.device],check=True)
fixture=json.loads(Path(a.fixture).read_text());run=fixture['runId'];issues=[]
def command(*args,**kw):return subprocess.run([APPLE,'simctl',*args],check=True,**kw)
def hook(path,**params):
    with urllib.request.urlopen('http://127.0.0.1:8765/'+path+('?' + urllib.parse.urlencode(params) if params else ''),timeout=10) as r:return json.load(r)
def wait(screen,rows=1):
    for _ in range(50):
        try:
            s=hook('state').get('trader',{})
            if s.get('screen')==screen and s.get('rows',0)>=rows:return s
        except Exception:pass
        time.sleep(.3)
    (OUT/'failed-state.json').write_text(json.dumps(hook('state')))
    shot('failed-screen')
    raise RuntimeError('Screen did not settle: '+screen+' '+str(s))
def shot(name):
    command('io',a.device,'screenshot',str(OUT/(name+'.png')),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    (OUT/(name+'.json')).write_text(json.dumps(hook('layout')))
def orient(value):
    hook('action',name='orientation',value=value)
    for _ in range(40):
        time.sleep(.2);s=hook('state')['trader']
        if (s['width']>s['height'])==(value=='landscape'):return s
    raise RuntimeError('Orientation did not settle')
def layout():return hook('layout')['layout']
def scan(prefix,terms):
    seen=''
    for i in range(24 if a.strategy else 18):
        hook('scroll',y=i*500);time.sleep(.18);part=json.dumps(layout(),ensure_ascii=False);seen+=part
        if i in [0,2,4,6]:shot(prefix+'-'+str(i))
    for term in terms:
        if term not in seen:issues.append('Missing visible content: '+term)
    hook('action',name='top');time.sleep(.2)
def same(before,after):
    def keys(items):return [(x['kind'],tuple(x['frame']),x.get('text'),x.get('shown')) for x in items]
    return sorted(keys(before),key=repr)==sorted(keys(after),key=repr)
installed=False
try:
    command('install',a.device,str(ROOT/'build/Release-iphonesimulator/Trader.app'),timeout=240);installed=True
    container=Path(subprocess.check_output([APPLE,'simctl','get_app_container',a.device,BUNDLE,'data'],text=True).strip())
    target=container/'Library/Application Support/Trader';target.mkdir(parents=True,exist_ok=True)
    (target/'responses.json').write_text(json.dumps(fixture['responses']))
    (target/'simulator-credential.json').write_text(json.dumps({'serverURL':'https://trader.invalid','token':'fixture-only-offline-credential-000000000000'}))
    (target/'simulator-credential.json').chmod(0o600)
    # All UI checks read this bounded fixture. The invalid test-only connection has no live credentials.
    command('launch',a.device,BUNDLE,stdout=subprocess.DEVNULL)
    wait('rankings',100);hook('action',name='offline',value='true');orient('portrait');shot('rankings-portrait')
    if not a.restore_only:
        hook('action',name='open',screen='run',id=run,stage='virtual');wait('run',6)
        scan('run', ['bearish day','scheduled exit'])
        hook('action',name='open',screen='trade',id=run,stage='virtual',version='1');wait('trade',9)
        orient('portrait');shot('trade-portrait')
        scan('trade', ['Open','Close','bearish day','scheduled exit','Price P','Signal','Spread','Drawdown']+(['NY session','Path efficiency','Δ','Minimum bullish close','22:00'] if a.strategy else []))
        orient('landscape');shot('trade-landscape');orient('portrait')
        hook('action',name='open',screen='trade',id=run,stage='virtual',version='0');wait('trade',9)
        shot('partial-portrait');scan('partial',['Tick gaps','Gap'])
    else:
        hook('action',name='open',screen='trade',id=run,stage='virtual',version='0');wait('trade',9)
    # Offline refresh preserves saved chart data.
    hook('action',name='refresh');time.sleep(.4);assert hook('state')['trader']['rows']>=9
    # Persist a scrolled trade, then verify cold and warm first-frame restoration.
    hook('scroll',y=420);time.sleep(.4);before=layout()
    (OUT/'restore-before-state.json').write_text(json.dumps({'layout':before,'state':hook('state')}))
    shot('restore-before')
    command('launch',a.device,'com.apple.Preferences',stdout=subprocess.DEVNULL);time.sleep(1)
    command('terminate',a.device,BUNDLE,stdout=subprocess.DEVNULL)
    command('launch',a.device,BUNDLE,stdout=subprocess.DEVNULL);wait('trade',9);time.sleep(8)
    samples=hook('timeline')['timeline'];assert samples and samples[0]['sinceFirstFrame']==0
    (OUT/'restore-timeline.json').write_text(json.dumps(samples))
    (OUT/'restore-after-state.json').write_text(json.dumps({'layout':layout(),'state':hook('state')}))
    shot('restore-after')
    if not same(before,samples[0]['layout']):issues.append('Cold first-frame layout changed')
    if not all(same(before,s['layout']) for s in samples):issues.append('Cold restore later changed')
    before=layout();command('launch',a.device,'com.apple.Preferences',stdout=subprocess.DEVNULL);time.sleep(1)
    command('launch',a.device,BUNDLE,stdout=subprocess.DEVNULL);time.sleep(1)
    if not same(before,layout()):issues.append('Warm return changed')
    shot('restored-partial')
    assert not issues,'; '.join(issues)
    print('PASS: '+('focused offline cold/warm restore' if a.restore_only else 'fixture run + both trades, price/cost/risk/reasons, gaps, portrait/landscape, offline, exact cold/warm restore'),flush=True)
finally:
    if installed:
        subprocess.run([APPLE,'simctl','terminate',a.device,BUNDLE],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        command('uninstall',a.device,BUNDLE)
