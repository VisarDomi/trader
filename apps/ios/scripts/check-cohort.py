#!/usr/bin/env python3
"""Guarded, offline simulator check of cohort search and navigation restoration."""
import argparse,json,subprocess,time,urllib.parse,urllib.request
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--device',required=True);p.add_argument('--fixture',required=True);a=p.parse_args()
ROOT=Path(__file__).resolve().parents[1];TOOLS=Path.home()/'Developer/ios-tools/native/scripts';APPLE=str(TOOLS/'apple-tool');BUNDLE='com.visar.Trader.qa'
OUT=Path('/tmp/trader-cohort-qa');OUT.mkdir(exist_ok=True)
subprocess.run([str(TOOLS/'mac-workload'),'assert-simulator','--device',a.device],check=True)
def command(*args,**kw):return subprocess.run([APPLE,'simctl',*args],check=True,**kw)
def hook(path,**params):
    with urllib.request.urlopen('http://127.0.0.1:8765/'+path+('?' + urllib.parse.urlencode(params) if params else ''),timeout=10) as r:return json.load(r)
def wait(screen,rows=None):
    for _ in range(60):
        try:
            s=hook('state')['trader']
            if s['screen']==screen and (rows is None or s['rows']==rows):return s
        except Exception:pass
        time.sleep(.25)
    raise RuntimeError('Unsettled '+screen+': '+str(s))
def shot(name):command('io',a.device,'screenshot',str(OUT/(name+'.png')),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def assert_filter():
    s=wait('rankings',20);assert s['query']=='visar' and s['searchText']=='visar' and s['sort']==2,s
    return s
installed=False
try:
    command('install',a.device,str(ROOT/'build/Release-iphonesimulator/Trader.app'),timeout=240);installed=True
    container=Path(subprocess.check_output([APPLE,'simctl','get_app_container',a.device,BUNDLE,'data'],text=True).strip());target=container/'Library/Application Support/Trader';target.mkdir(parents=True,exist_ok=True)
    (target/'responses.json').write_text(json.dumps(json.loads(Path(a.fixture).read_text())['responses']))
    (target/'simulator-credential.json').write_text(json.dumps({'serverURL':'https://trader.invalid','token':'fixture-only-offline-credential-000000000000'}));(target/'simulator-credential.json').chmod(0o600)
    command('launch',a.device,BUNDLE,stdout=subprocess.DEVNULL);wait('rankings',21)
    hook('action',name='offline',value='true');hook('action',name='search',query='visar');wait('rankings',20);hook('action',name='sort',value='2');assert_filter();shot('filtered-portrait')
    hook('scroll',y=500);time.sleep(.4);before=assert_filter()
    hook('action',name='open-row',index='0');wait('run');hook('back');after=assert_filter();(OUT/'back-state.json').write_text(json.dumps({'before':before,'after':after}));shot('back-position');assert after['currentAnchor']==before['currentAnchor'] and abs(after['anchorFraction']-before['anchorFraction'])<.02,(before,after)
    hook('forward');wait('run');hook('back');assert_filter();shot('returned-filter')
    hook('action',name='orientation',value='landscape');time.sleep(1.5);assert_filter();shot('filtered-landscape')
    hook('action',name='orientation',value='portrait');time.sleep(1.5);assert_filter()
    hook('scroll',y=500);time.sleep(.4);before=assert_filter();(OUT/'before.json').write_text(json.dumps(before))
    command('launch',a.device,'com.apple.Preferences',stdout=subprocess.DEVNULL);time.sleep(1);command('terminate',a.device,BUNDLE,stdout=subprocess.DEVNULL);command('launch',a.device,BUNDLE,stdout=subprocess.DEVNULL)
    after=assert_filter();(OUT/'back-state.json').write_text(json.dumps({'before':before,'after':after}));shot('back-position');assert after['currentAnchor']==before['currentAnchor'] and abs(after['anchorFraction']-before['anchorFraction'])<.02,(before,after);time.sleep(8);assert_filter();shot('cold-filter-restored')
    (OUT/'timeline.json').write_text(json.dumps(hook('timeline')))
    command('launch',a.device,'com.apple.Preferences',stdout=subprocess.DEVNULL);time.sleep(1);command('launch',a.device,BUNDLE,stdout=subprocess.DEVNULL);time.sleep(1);assert_filter()
    print('PASS: 20-member search, sort, detail/back/forward, scroll, portrait/landscape, offline cold/warm restoration',flush=True)
finally:
    if installed:
        subprocess.run([APPLE,'simctl','terminate',a.device,BUNDLE],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        command('uninstall',a.device,BUNDLE)
