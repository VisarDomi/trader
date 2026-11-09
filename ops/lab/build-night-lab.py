#!/usr/bin/env python3
"""Publish bounded derived night-study results; never copy ticks, credentials or account data."""
import array,base64,datetime as dt,gzip,hashlib,json,math,pathlib,zoneinfo
ROOT=pathlib.Path(__file__).resolve().parents[2];P=ROOT/'apps/backend/data/night-breakdown-20261109';OUT=ROOT/'apps/ui/static/night-lab';OUT.mkdir(parents=True,exist_ok=True)
STUDY=ROOT/'apps/backend/data/night-session-study-20261109'
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
selection=json.loads((ROOT/'research/night-cohort-20261109.json').read_text())
cohort=[]
inputs=[(load('../night-audit-20261108/baseline-x200.json'),{'sessionWindow':'full','minimumGapBp':0,'policy':'current','role':'original'})]
for chosen in selection['agents']:
    file=ROOT/'apps/backend/data/backtests/2024-01_2026-09'/f"{chosen['id'].replace('/','__')}__{chosen['epic']}__x{chosen['leverage']}.json"
    r=json.loads(file.read_text());assert r['codeHash']==chosen['codeHash']
    inputs.append((r,chosen))
for r,chosen in inputs:
    cohort.append({'id':r['agentId'],'epic':r['epic'],'leverage':r['leverage'],'lossPct':r['params']['lossPct'],'params':r['params'],'metrics':r['metrics'],'codeHash':r['codeHash'],'benchmarkEpic':r['epic'],'benchmarkExcessPp':r['metrics']['totalReturn']*100-benchmarks[r['epic']]['returnPct'],**{k:chosen[k] for k in ['sessionWindow','minimumGapBp','policy','role']}})
assert len(cohort)==20 and sum(r['epic']=='US500' for r in cohort)==10
(ROOT/'apps/ui/src/lib/server/night-lab-cohort.json').write_text(json.dumps([{k:r[k] for k in ['id','codeHash','epic','leverage']} for r in cohort],indent=2)+'\n')
study_events=json.loads((STUDY/'event-calendar.json').read_text());trade_sets={}
def package_runs(rows,epic):
    rs=[];cs={}
    for r in rows:
        x={k:v for k,v in r.items() if k not in ['equity','rejectReasons','stoppedThenPositive']};x['benchmarkEpic']=epic;x['benchmarkExcessPp']=r['returnPct']-benchmarks[epic]['returnPct'];rs.append(x)
        if r['profile'] in ['L1S50','L20S20','L50S5','L50S40','L100S10','L200S50']:
            gap=str(r.get('minimumGapBp',0));cs.setdefault(gap,{})[r['policy']+'/'+r['profile']]=r['equity']
    return rs,cs
for inst in instruments:
    epic=inst['epic'];summary=json.loads((STUDY/f'{epic}-summary.json').read_text());gaps=json.loads((STUDY/f'{epic}-gap-summary.json').read_text())
    trade_sets[epic]=summary['trades']['full'];trade_sets[epic+'-central']=summary['trades']['central']
    cr,cc=package_runs(summary['runs'],epic)
    inst['central']={'spec':summary['spec'],'runs':cr,'curves':cc['0'],'trades':summary['trades']['central']}
    checks=[]
    for seed,density in [(1,16),(2,16),(3,16),(1,64)]:
        path=STUDY/(f'{epic}-current.json' if (seed,density)==(1,16) else f'{epic}-sensitivity-{seed}-{density}.json');value=json.loads(path.read_text());rs=value['runs'] if isinstance(value,dict) else value
        r=next(r for r in rs if r['leverage']==20 and r['params']['lossPct']==20);checks.append({'seed':seed,'ticksPerMinute':density,'n':len(r['trades']),'winPct':r['metrics']['winRate']*100,'returnPct':r['metrics']['totalReturn']*100})
    inst['centralQuoteChecks']=checks
    inst['classificationChanges']=summary['classificationChanges'];inst['fullEventStats']=summary['fullEventStats'];inst['gapStudy']={'minimumGapBp':gaps['minimumGapBp'],'sessions':{}}
    for window,group in gaps['sessions'].items():
        positive=[r for r in group['runs'] if r['minimumGapBp']>0];gr,gc=package_runs(positive,epic)
        inst['gapStudy']['sessions'][window]={'runs':gr,'curves':gc,'trades':{k:v for k,v in group['trades'].items() if k!='0'},'audit':group['audit']}
        for gap in ['5','15','30']:
            for t in group['trades'][gap]:t['minimumGapBp']=int(gap)
    for window,rows in summary['trades'].items():
        for t in rows:t['minimumGapBp']=0
data={'generatedAt':dt.datetime.now(UTC).isoformat(),'years':(dt.date(2026,10,1)-dt.date(2024,1,1)).days/365.25,'window':['2024-01-01','2026-09-30'],'benchmarks':benchmarks,'stocks':stocks,'cohort':cohort,'instruments':instruments,'trades':trade_sets,'events':study_events,'gapThresholds':[0,5,15,30],'caseCount':5184,'selection':{k:selection[k] for k in ['date','method','tierUse']}}
assert len(instruments)==2 and all(len(x['runs'])==324 for x in instruments)
(OUT/'report.json').write_text(json.dumps(data,separators=(',',':')))
packed=base64.b64encode(gzip.compress(json.dumps(data,separators=(',',':')).encode(),mtime=0)).decode()
template=(ROOT/'ops/lab/night-lab-template.html').read_text().replace('__STUDY_SCRIPT__',(ROOT/'ops/lab/night-lab-study-view.js').read_text());(OUT/'index.html').write_text(template.replace('__DATA__',packed))
(OUT/'sw.js').write_text((ROOT/'ops/lab/night-lab-sw.js').read_text().replace('__VERSION__',hashlib.sha256(packed.encode()).hexdigest()[:12]).replace('__COHORT_VERSION__',hashlib.sha256(json.dumps([(r['id'],r['codeHash']) for r in cohort]).encode()).hexdigest()[:12]))
(OUT/'manifest.webmanifest').write_text(json.dumps({'id':'/night-lab/','name':'Visar Night Lab','short_name':'Night Lab','start_url':'/night-lab/index.html','scope':'/night-lab/','display':'standalone','background_color':'#101114','theme_color':'#101114','icons':[{'src':'./icon-192.png','sizes':'192x192','type':'image/png'},{'src':'./icon-512.png','sizes':'512x512','type':'image/png'}]},indent=2)+'\n')
for name in ['trades.csv','risk-grid.csv','us100-risk-grid.csv']:(OUT/name).write_text((P/name).read_text())
for epic in ['US500','US100']:(OUT/f'{epic.lower()}-gap-risk-grid.csv').write_text((STUDY/f'{epic}-gap-risk-grid.csv').read_text())
print('Published',len(cohort),'cohort members; 5184 risk cells; full and central sessions; 0/5/15/30bp gaps')
print('Nasdaq fee-free full-cash price proxy',round(benchmarks['US100']['returnPct'],3),'%; whole-share scenario',round(whole,2),'USD; broker USD matches',len(known),'/101')
