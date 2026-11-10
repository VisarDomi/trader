#!/usr/bin/env python3
"""Publish bounded derived night-study results to the Night Lab database; never copy ticks, credentials or account data."""
import array,datetime as dt,hashlib,json,math,pathlib,zoneinfo
ROOT=pathlib.Path(__file__).resolve().parents[2];P=ROOT/'apps/backend/data/night-breakdown-20261109'
import night_lab_db  # the published report is one SQLite file served by the dashboard, never static assets
STUDY=ROOT/'apps/backend/data/night-session-study-20261109'
EXITS=ROOT/'apps/backend/data/night-exit-study-20261109'
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
# The live cohort (v3, 2026-11-09): ten single-dimension directions per index around one base, the
# original agent kept as the US500 full-day 1:200 point. Earlier selections stay in research/ for history.
selection=json.loads((ROOT/'research/night-cohort-v3-20261109.json').read_text())
cohort=[]
inputs=[]
GRID_DAY={'Standard':'standard','Move ≥0.5%':'big-move','Body ≥80% of range':'strong-day','≥62% of steps agree':'steady-day'}
GRID_SIDE={'previous day':'rule','always long':'long','random':'random'}
for chosen in selection['members']:
    if chosen['role']=='original':r=load('../night-audit-20261108/baseline-x200.json')
    else:
        file=ROOT/'apps/backend/data/backtests/2024-01_2026-09'/f"{chosen['id'].replace('/','__')}__{chosen['epic']}__x{chosen['leverage']}.json"
        r=json.loads(file.read_text())
    assert r['codeHash']==chosen['codeHash'] and r['agentId']==chosen['id'] and r['leverage']==chosen['leverage']
    inputs.append((r,chosen))
for r,chosen in inputs:
    hits=sum(t['exitReason']=='take_profit' or (t.get('exitNote')or'').startswith('capital take profit +') for t in r['trades'])
    meta={k:chosen[k] for k in ['sessionWindow','minimumGapBp','policy','role','name','dimension','explores','coordinates','comparesWith']}
    if chosen['role']=='control':meta.update({k:chosen[k] for k in ['partner','direction']})
    c=chosen['coordinates']  # the same setting in the nightly paper grid (src/lab/night-study/forward-grid.ts)
    meta['gridCell']=f"{c['window']}/{GRID_DAY[c['day']]}/gap-{c['gapBp']}bp/x{c['leverage']}/{GRID_SIDE[c['side']]}"
    assert c['lossPct']==50 and c['window'] in ('central','full') and c['gapBp'] in (0,5,15,30) and c['leverage'] in (20,200)
    cohort.append({'id':r['agentId'],'epic':r['epic'],'leverage':r['leverage'],'lossPct':r['params']['lossPct'],'profitPct':r['params'].get('profitPct',0),'targetHits':hits,'pathRange':None,'params':r['params'],'metrics':r['metrics'],'codeHash':r['codeHash'],'benchmarkEpic':r['epic'],'benchmarkExcessPp':r['metrics']['totalReturn']*100-benchmarks[r['epic']]['returnPct'],**meta})
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
    exits=json.loads((EXITS/f'{epic}-summary.json').read_text())
    controls={(r['sessionWindow'],r['minimumGapBp'],r['policy'],r['profile']):r for r in exits['runs'] if r['profitPct']==0}
    for window,rows in [('full',inst['runs']),('central',inst['central']['runs'])]+[(w,inst['gapStudy']['sessions'][w]['runs']) for w in ['full','central']]:
        for r in rows:
            c=controls[(window,r.get('minimumGapBp',0),r['policy'],r['profile'])]
            assert abs(c['returnPct']-r['returnPct'])<1e-9
            for k in ['profitPct','targetHits','deadlineExits','otherExits']:r[k]=c[k]
    positive=[dict(r,benchmarkEpic=epic,benchmarkExcessPp=r['returnPct']-benchmarks[epic]['returnPct']) for r in exits['runs'] if r['profitPct']>0]
    inst['exitStudy']={'runs':positive,'curves':exits['curves'],'audit':exits['audit']}
data={'generatedAt':dt.datetime.now(UTC).isoformat(),'years':(dt.date(2026,10,1)-dt.date(2024,1,1)).days/365.25,'window':['2024-01-01','2026-09-30'],'benchmarks':benchmarks,'stocks':stocks,'cohort':cohort,'instruments':instruments,'trades':trade_sets,'events':study_events,'gapThresholds':[0,5,15,30],'takeProfitTargets':[0,20,50,100],'caseCount':20736,'selection':{k:selection[k] for k in ['date','revision','method','base']}}
assert len(instruments)==2 and all(len(x['runs'])==324 for x in instruments)
# One database holds the complete report and its CSV exports (compressed once, here). The dashboard
# serves each page section from it on demand; report.json is rebuilt from it byte for byte.
text=lambda path:path.read_text().encode()  # the published CSVs have always had normalised newlines
exports=[(name,'text/csv',text(P/name)) for name in ['trades.csv','risk-grid.csv','us100-risk-grid.csv']]
exports+=[(f'{epic.lower()}-gap-risk-grid.csv','text/csv',text(STUDY/f'{epic}-gap-risk-grid.csv')) for epic in ['US500','US100']]
exports+=[(f'{epic.lower()}-exit-risk-grid.csv','text/csv',text(EXITS/f'{epic.lower()}-exit-risk-grid.csv')) for epic in ['US500','US100']]
assert sorted(n for n,_,_ in exports)==sorted(night_lab_db.CSV_EXPORTS)
version=night_lab_db.write(data,exports,night_lab_db.LAB_DB,'build-night-lab.py')
dest=night_lab_db.server_dir()
if dest:print('Dashboard copy',dest,'updated' if night_lab_db.publish(night_lab_db.LAB_DB,dest) else 'already current')
else:print('No dashboard runtime on this machine; nightly.sh publishes',night_lab_db.LAB_DB,'where one exists')
print('Published report',version,'·',len(cohort),'cohort members · 20736 risk cells · 0/20/50/100% profit targets')
print('Nasdaq fee-free full-cash price proxy',round(benchmarks['US100']['returnPct'],3),'%; whole-share scenario',round(whole,2),'USD; broker USD matches',len(known),'/101')
