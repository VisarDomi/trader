#!/usr/bin/env python3
"""Publish bounded derived night-study results; never copy ticks, credentials or account data."""
import array,base64,datetime as dt,gzip,hashlib,json,math,pathlib,zoneinfo
ROOT=pathlib.Path(__file__).resolve().parents[2];P=ROOT/'apps/backend/data/night-breakdown-20261109';OUT=ROOT/'apps/ui/static/night-lab';OUT.mkdir(parents=True,exist_ok=True)
NY=zoneinfo.ZoneInfo('America/New_York');AL=zoneinfo.ZoneInfo('Europe/Tirane');UTC=dt.timezone.utc
def load(name):return json.loads((P/name).read_text())
def hold(epic):
    raw=(ROOT/f'apps/backend/data/candles/{epic}_1704067200000_1790812800000.f64').read_bytes();a=array.array('d');a.frombytes(raw)
    entry=a[1]+a[5];peak=10000;dd=0;days={}
    for i in range(0,len(a),7):
        t,o,h,l,c,spread,volume=a[i:i+7];equity=10000*c/entry;peak=max(peak,equity);dd=max(dd,1-equity/peak);days[int(t)//86400000]=equity
    points=[[day*86400000,round(v,4)] for day,v in days.items()]
    return a,{'epic':epic,'returnPct':(a[-3]/entry-1)*100,'finalEquity':10000*a[-3]/entry,'entryAsk':entry,'exitBid':a[-3],'from':a[0],'through':a[-7]+60000,'maxDrawdownPct':dd*100,'equity':points,'funding':0,'exposure':1,'inputSHA':hashlib.sha256(raw).hexdigest()}
arrays={};benchmarks={}
for epic in ['US500','US100']:arrays[epic],benchmarks[epic]=hold(epic)
instruments=[]
for epic,prefix in [('US500',''),('US100','us100-')]:
    g=load(prefix+'grid-summary.json');runs=[];curves={}
    for r in g['runs']:
        x={k:v for k,v in r.items() if k not in ['equity','rejectReasons','stoppedThenPositive']};x['benchmarkEpic']=epic;x['benchmarkExcessPp']=r['returnPct']-benchmarks[epic]['returnPct'];runs.append(x)
        if r['profile'] in ['L1S50','L20S20','L50S5','L50S40','L100S10','L200S50']:curves[r['policy']+'/'+r['profile']]=r['equity']
    instruments.append({'epic':epic,'spec':g['spec'],'runs':runs,'curves':curves})
stocks=load('stock-minimums.json');weight=sum(r['weight'] for r in stocks['rows']);known=[]
for r in stocks['rows']:
    r['normalizedWeight']=r['weight']/weight
    r['usdMatched']=bool(r['ask'] and r['minDealSize'] and r['currency']=='USD' and r['lotSize']==1)
    r['minimumNotional']=r['ask']*r['minDealSize'] if r['usdMatched'] else None
    if r['usdMatched']:known.append(r)
whole=sum(r['holdingsPrice'] for r in stocks['rows']);binding=max(stocks['rows'],key=lambda r:r['holdingsPrice']/r['normalizedWeight']);weighted=binding['holdingsPrice']/binding['normalizedWeight']
stocks.update({'wholeShareBasket':whole,'wholeShareWeightedFloor':weighted,'wholeShareRoundedCash':sum(math.ceil(weighted*r['normalizedWeight']/r['holdingsPrice']-1e-10)*r['holdingsPrice'] for r in stocks['rows']),'bindingTicker':binding['ticker'],'matched':len(known),'partialCFDFloor':sum(r['minimumNotional'] for r in known),'partialWeightedCFDFloor':max(r['minimumNotional']/r['normalizedWeight'] for r in known),'missing':[r['ticker'] for r in stocks['rows'] if not r['usdMatched']]})
cohort=[]
files=list((ROOT/'apps/backend/data/backtests/2024-01_2026-09').glob('visar-night-lab__*'))+list((ROOT/'apps/backend/data/backtests/2024-01_2026-09').glob('visar-night-us100__*'))
for r in [load('../night-audit-20261108/baseline-x200.json')]+[json.loads(f.read_text()) for f in files]:
    cohort.append({'id':r['agentId'],'epic':r['epic'],'leverage':r['leverage'],'lossPct':r['params']['lossPct'],'params':r['params'],'metrics':r['metrics'],'codeHash':r['codeHash'],'benchmarkEpic':r['epic'],'benchmarkExcessPp':r['metrics']['totalReturn']*100-benchmarks[r['epic']]['returnPct']})
assert len(cohort)==20 and sum(r['epic']=='US500' for r in cohort)==10
(ROOT/'apps/ui/src/lib/server/night-lab-cohort.json').write_text(json.dumps([{k:r[k] for k in ['id','codeHash','epic','leverage']} for r in cohort],indent=2)+'\n')
trades=load('breakdown.json')['rows']
# Nasdaq original-rule paths are research observations, not new live original records.
opps={r['date']:r for r in load('us100-opportunities.json')};a=arrays['US100'];wanted={r['session'] for r in opps.values()};paths={}
for i in range(0,len(a),7):
    t,o,h,l,c,sp,v=a[i:i+7];ny=dt.datetime.fromtimestamp(t/1000,UTC).astimezone(NY);date=ny.date().isoformat();m=ny.hour*60+ny.minute
    if date not in wanted or not 570<=m<960:continue
    if m==570:paths[date]=[[int(t),o]]
    if (m+1-570)%15==0:paths[date].append([int(t+60000),c])
us100=[];balance=10000
for i,r in enumerate(load('us100-stored.json')['trades']):
    date=dt.datetime.fromtimestamp(r['entryTime']/1000,UTC).astimezone(AL).date().isoformat();op=opps[date];f=op['features'];points=paths[op['session']];start=points[0][1]
    us100.append({'id':i+1,'date':date,'session':op['session'],'side':r['side'],'returnPct':r['pnl']/balance*100,'entryPrice':r['entryPrice'],'exitPrice':r['exitPrice'],'stop':r['exitReason']=='stop_loss','entryTime':r['entryTime'],'exitTime':r['exitTime'],'size':r['size'],'pnl':r['pnl'],'entryEquity':balance,'spreadCostPct':r['execution']['spreadCost']/balance*100,'funding':r['funding'],'movePct':f['move'],'efficiency':f['eff'],'agreementSteps':round(f['agree']*26),'retracement':f['retrace'],'body':f['body'],'rangePct':f['range'],'pullbackBp':abs(op['bid']-op['reference'])/op['reference']*10000,'checkpoints':[[t,round((v/start-1)*100,5)] for t,v in points]});balance+=r['pnl']
keep=['id','date','session','side','returnPct','entryPrice','exitPrice','stop','movePct','efficiency','agreementSteps','retracement','body','rangePct','pullbackBp','checkpoints','entryTime','exitTime','size','pnl','entryEquity','spreadCostPct','funding']
data={'generatedAt':dt.datetime.now(UTC).isoformat(),'years':(dt.date(2026,10,1)-dt.date(2024,1,1)).days/365.25,'window':['2024-01-01','2026-09-30'],'benchmarks':benchmarks,'stocks':stocks,'cohort':cohort,'instruments':instruments,'trades':{'US500':[{k:r[k] for k in keep} for r in trades],'US100':us100}}
assert len(instruments)==2 and all(len(x['runs'])==324 for x in instruments)
(OUT/'report.json').write_text(json.dumps(data,separators=(',',':')))
packed=base64.b64encode(gzip.compress(json.dumps(data,separators=(',',':')).encode(),mtime=0)).decode()
template=(ROOT/'ops/lab/night-lab-template.html').read_text();(OUT/'index.html').write_text(template.replace('__DATA__',packed))
(OUT/'sw.js').write_text((ROOT/'ops/lab/night-lab-sw.js').read_text().replace('__VERSION__',hashlib.sha256(packed.encode()).hexdigest()[:12]))
(OUT/'manifest.webmanifest').write_text(json.dumps({'id':'/night-lab/','name':'Visar Night Lab','short_name':'Night Lab','start_url':'/night-lab/index.html','scope':'/night-lab/','display':'standalone','background_color':'#101114','theme_color':'#101114','icons':[{'src':'./icon-192.png','sizes':'192x192','type':'image/png'},{'src':'./icon-512.png','sizes':'512x512','type':'image/png'}]},indent=2)+'\n')
for name in ['trades.csv','risk-grid.csv','us100-risk-grid.csv']:(OUT/name).write_text((P/name).read_text())
print('Published',len(cohort),'cohort members; 648 risk cells;',len(trades),'+',len(us100),'baseline trades')
print('Nasdaq fee-free full-cash price proxy',round(benchmarks['US100']['returnPct'],3),'%; whole-share scenario',round(whole,2),'USD; broker USD matches',len(known),'/101')
