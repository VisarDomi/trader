#!/usr/bin/env python3
"""Build the simulator QA fixture from the live v2 screens: the exact bytes and ETags the phone would store.

  python3 apps/ios/scripts/screen-fixture.py OUT.json   (on the PC; reads the private device key, prints nothing secret)

The fixture holds derived screens only (no ticks, credentials or account identifiers beyond what the app shows)
and belongs outside the repository; check-simulator.py seeds the QA app's trader.sqlite with it.
"""
import json,sys,urllib.parse,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
token=json.loads((ROOT/'Private/primary-phone.json').read_text())['token']
q=lambda s:urllib.parse.quote(s,safe='')
NIGHT='demo:visar-night-v3-us100/full-day-200:US100:x200:6d175db7dd11';ORIGINAL='demo:visar-night-trading:US500:x200:56ac3bdfe7c1'
SWING=json.loads(urllib.request.urlopen('http://127.0.0.1:4120/api/agents/swing-reversal/p05').read())['runs']
SWING=[r['id'] for r in SWING if r['kind']=='demo' and r['status']!='retired' and ':delay=' not in r['id']]
# Route keys exactly as Route.cacheKey builds them (Logic.swift).
keys=['rankings?stage=capital','rankings?stage=virtual','agents','accounts','status',
      f"agent?id={q('visar-night-v3-us100/full-day-200')}",f"agent?id={q('visar-night-trading')}",f"agent?id={q('swing-reversal/p05')}",
      f"run?id={q(ORIGINAL)}",f"run?id={q(NIGHT)}",f"trade?id={q(NIGHT)}&trade=0&stage=virtual",f"trade?id={q(ORIGINAL)}&trade=2&stage=virtual"]
screens=[]
for key in keys:
    r=urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:10003/api/native/v2/'+key,headers={'Authorization':'Bearer '+token}),timeout=60)
    screens.append({'key':key,'rev':r.headers['ETag'],'body':r.read().decode()})
opens=[
 {'screen':'agent','id':'visar-night-v3-us100/full-day-200','rows':3,'terms':['Live records','Trades · 1','Paper P&L','Demo P&L','Stop loss']},
 {'screen':'trade','id':NIGHT,'stage':'virtual','version':'0','rows':8,'terms':['Previous NY session','22:00 → 03:27','Trade · 03:27','Paper P&L','Demo P&L (0.2×)','Entry limits','Capital order timing']},
 {'screen':'agent','id':'visar-night-trading','rows':3,'terms':['Trades · 3','+$7,119.22','+$1,376.06']},
 {'screen':'run','id':ORIGINAL,'rows':6,'terms':['Virtual ·','Capital demo ·','Trades · 3','Same-code backtest']},
 {'screen':'agent','id':'swing-reversal/p05','rows':50,'terms':['Trades ·']},
]
Path(sys.argv[1]).write_text(json.dumps({'screens':screens,'open':opens}))
print(f"{len(screens)} screens, {sum(len(s['body']) for s in screens)//1024} KiB")
