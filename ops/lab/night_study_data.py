"""Independent session oracle, reconciled research summaries and sourced event context."""
import array,collections,csv,datetime as dt,hashlib,json,math,pathlib,re,statistics,zoneinfo
import night_lab_db
ROOT=pathlib.Path(__file__).resolve().parents[2]
OLD=ROOT/'apps/backend/data/night-breakdown-20261109'
OUT=ROOT/'apps/backend/data/night-session-study-20261109'
UTC=dt.timezone.utc;NY=zoneinfo.ZoneInfo('America/New_York');AL=zoneinfo.ZoneInfo('Europe/Tirane')
WINDOWS={'full':(570,960),'central':(630,930)}
BASE={'trendPct':.25,'minEfficiency':.15,'minDirectionalShare':.5,'maxRetraceShare':.75,'maxRangePct':2,'minBodyShare':.6,'minCoverage':.9}
def load(path):return json.loads(path.read_text())
def calendar():
    source=(ROOT/'apps/backend/src/sdk/policy-calendar.ts').read_text()
    return {k:set(re.findall(r"'([0-9-]{10})'",source.split('const '+k+' = new Set([')[1].split(']);')[0])) for k in ['FOMC','BOJ']}
def classify(f,p,start,end):
    ok=f['n']>=math.ceil((end-start)*p['minCoverage']) and f['points']==1+(end-start)//15 and f['move']>=p['trendPct'] and f['eff']>=p['minEfficiency'] and f['agree']>=p['minDirectionalShare'] and f['retrace']<=p['maxRetraceShare'] and 0<f['range']<=p['maxRangePct'] and f['body']>=p['minBodyShare']
    return f['direction'] if ok else 0
def features(d):
    change=d['prices'][-1]-d['open'];direction=(change>0)-(change<0);steps=[b-a for a,b in zip(d['prices'],d['prices'][1:])];distance=sum(map(abs,steps));ran=d['high']-d['low']
    return {'direction':direction,'move':abs(change)/d['open']*100,'eff':abs(change)/distance if distance else 0,'agree':sum(s*direction>0 for s in steps)/d['intervals'],'retrace':(d['draw'] if direction>0 else d['rebound'])/ran if ran else 1,'range':ran/d['open']*100,'body':abs(change)/ran if ran else 0,'n':d['n'],'points':len(d['prices'])}
def oracle(epic,policies):
    file=ROOT/f'apps/backend/data/candles/{epic}_1704067200000_1790812800000.f64';raw=file.read_bytes();a=array.array('d');a.frombytes(raw)
    published=night_lab_db.benchmark(epic)['inputSHA'];assert hashlib.sha256(raw).hexdigest()==published
    days={k:{} for k in WINDOWS};active={};opps={k:{p['id']:[] for p in policies} for k in WINDOWS};refdate=None;reference=0;selected={};cal=calendar()
    for i in range(0,len(a),7):
        t,o,h,l,c,spread,volume=a[i:i+7];time=dt.datetime.fromtimestamp(t/1000,UTC);ny=time.astimezone(NY);local=(time+dt.timedelta(minutes=1)).astimezone(AL);nm=ny.hour*60+ny.minute;lm=local.hour*60+local.minute;date=ny.date().isoformat()
        for key,(start,end) in WINDOWS.items():
            if nm==start and ny.weekday()<5:active[key]={'date':date,'open':o,'high':o,'low':o,'draw':0.,'rebound':0.,'n':0,'prices':[o],'times':[int(t)],'intervals':(end-start)//15}
            day=active.get(key)
            if day and day['date']==date and start<=nm<end:
                day['n']+=1;day['high']=max(day['high'],h);day['low']=min(day['low'],l);day['draw']=max(day['draw'],day['high']-l);day['rebound']=max(day['rebound'],h-day['low'])
                if (nm+1-start)%15==0:day['prices'].append(c);day['times'].append(int(t+60000))
                if nm+1==end:day['features']=features(day);days[key][date]=day.copy()
        if lm==1320:
            refdate=local.date();reference=c;selected={k:days[k].get(refdate.isoformat()) for k in WINDOWS}
        if lm!=207 or local.weekday()>=5:continue
        yesterday=local.date()-dt.timedelta(days=1);previous=yesterday.isoformat();entrydate=local.date().isoformat()
        if refdate!=yesterday or previous in cal['FOMC']|cal['BOJ'] or entrydate in cal['BOJ']:continue
        for key,(start,end) in WINDOWS.items():
            day=selected.get(key)
            if not day:continue
            for policy in policies:
                direction=classify(day['features'],{**BASE,**policy['params']},start,end)
                side='long' if direction>0 and c<reference else 'short' if direction<0 and c>reference else None
                if side:opps[key][policy['id']].append({'date':entrydate,'session':previous,'side':side,'decision':int(t+60000),'bid':c,'reference':reference,'features':day['features']})
    old=load(OLD/('us100-opportunities.json' if epic=='US100' else '../night-audit-20261108/opportunities.json'))
    assert [(x['date'],x['side']) for x in old]==[(x['date'],x['side']) for x in opps['full']['current']],epic
    return {'days':days,'opportunities':opps,'inputSHA':published,'minuteRows':len(a)//7}
def event_catalog(session_dates):
    catalog=load(ROOT/'research/night-lab-events.json');cal=calendar();events=[];dates=sorted(set(session_dates))
    for key in ['FOMC','BOJ']:
        for date in sorted(cal[key]):
            if not '2024-01-01'<=date<='2026-09-30':continue
            events.append({'id':key.lower()+'-'+date,'date':date,'sessionDate':date,'category':'policy','label':key+' decision','timing':'14:00 New York; existing exclusion' if key=='FOMC' else 'Japan policy date; existing exclusion','scheduled':True,'policyGuard':True,'sources':[{'title':'Federal Reserve meeting calendar' if key=='FOMC' else 'Bank of Japan meeting calendar','url':'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm' if key=='FOMC' else 'https://www.boj.or.jp/en/mopo/mpmsche_minu/past.htm'}]})
    for raw in catalog['events']:
        e=dict(raw);date=e['date'];e['sessionDate']=next((d for d in dates if d>date),None) if e['attach']=='next-session' else date
        if e['sessionDate'] and '2024-01-01'<=e['sessionDate']<='2026-09-30':events.append(e)
    tagged={e['sessionDate'] for e in events if e['sessionDate'] in dates};share=len(tagged)/len(dates);assert share<=catalog['maxTaggedSessionShare'],('Calendar no longer sparse',share)
    return {**catalog,'events':sorted(events,key=lambda e:(e['sessionDate'],e['id'])),'sessionCount':len(dates),'taggedSessionCount':len(tagged),'taggedSessionShare':share}
def trade_events(events,session,entry_time):
    out=[]
    for e in events:
        if e['sessionDate']!=session:continue
        reported=e.get('reportedAt');known=True if e.get('scheduled') and not e.get('policyGuard') else None
        if reported:known=dt.datetime.fromisoformat(reported.replace('Z','+00:00')).timestamp()*1000<=entry_time
        out.append({'id':e['id'],'label':e['label'],'category':e['category'],'timing':e['timing'],'knownAtEntry':known,'sources':e['sources']})
    return out
def event_stats(ledger):
    out=[]
    for flagged in [False,True]:
        rows=[r for r in ledger if bool(r['events'])==flagged];n=len(rows)
        out.append({'label':'Listed major context' if flagged else 'No listed major context','n':n,'wins':sum(r['ret']>0 for r in rows),'meanPct':statistics.mean(r['ret'] for r in rows) if n else None,'dateOnly':sum(any(e['knownAtEntry'] is None for e in r['events']) for r in rows)})
    return out
def summarize(result,policy,profile,eligible,ops,events):
    balance=10000;ledger=[];longest=streak=0
    for t in result['trades']:
        date=dt.datetime.fromtimestamp(t['entryTime']/1000,UTC).astimezone(AL).date().isoformat();op=ops[date];assert op['side']==t['side'];ret=t['pnl']/balance*100
        ledger.append({'ret':ret,'year':int(date[:4]),'stop':t['exitReason']=='stop_loss','spread':t['execution']['spreadCost']/balance*100,'events':trade_events(events,op['session'],t['entryTime'])});balance+=t['pnl'];streak=0 if ret>0 else streak+1;longest=max(longest,streak)
    assert abs(round(balance,2)-result['metrics']['finalEquity'])<=.011
    n=len(ledger);wins=[r['ret'] for r in ledger if r['ret']>0];losses=[r['ret'] for r in ledger if r['ret']<=0];pp=len(wins)/n if n else 0;z=1.959963984540054;den=1+z*z/n if n else 1;center=(pp+z*z/(2*n))/den if n else 0;rad=z*math.sqrt(pp*(1-pp)/n+z*z/(4*n*n))/den if n else 0
    rejected=sum(r['message'].startswith('order rejected:') for r in result['logs']);log_truncated=len(result['logs'])>=100
    if not log_truncated and result['status']=='completed':assert n+rejected==eligible,(policy,profile['id'],n,rejected,eligible)
    aw=statistics.mean(wins) if wins else None;al=statistics.mean(losses) if losses else None
    years={}
    for year in [2024,2025,2026]:
        ys=[r for r in ledger if r['year']==year];years[str(year)]={'n':len(ys),'wins':sum(r['ret']>0 for r in ys),'returnPct':(math.prod(1+r['ret']/100 for r in ys)-1)*100,'meanPct':statistics.mean(r['ret'] for r in ys) if ys else None}
    equity=result['equity'];points=[[r['t'],r['equity']] for i,r in enumerate(equity) if i in [0,len(equity)-1] or r['equity']!=equity[i-1]['equity'] or (i+1<len(equity) and r['equity']!=equity[i+1]['equity'])]
    return {'policy':policy,'profile':profile['id'],'leverage':profile['leverage'],'lossPct':profile['lossPct'],'exposure':profile['leverage']*.9,'status':result['status'],'n':n,'eligible':eligible,'wins':len(wins),'winPct':100*pp if n else None,'winInterval':[100*(center-rad),100*(center+rad)] if n else None,'stops':sum(r['stop'] for r in ledger),'rejected':rejected,'unfilled':eligible-n,'rejectionLogTruncated':log_truncated,'tradesPerYear':n/((dt.date(2026,10,1)-dt.date(2024,1,1)).days/365.25),'returnPct':result['metrics']['totalReturn']*100,'maxDrawdownPct':result['metrics']['maxDrawdown']*100,'finalEquity':result['metrics']['finalEquity'],'meanPct':statistics.mean(r['ret'] for r in ledger) if n else None,'avgWinPct':aw,'avgLossPct':al,'worstTradePct':min((r['ret'] for r in ledger),default=None),'bestTradePct':max((r['ret'] for r in ledger),default=None),'breakEvenWinPct':100*(-al)/(aw-al) if aw is not None and al is not None and aw!=al else None,'longestLossStreak':longest,'meanSpreadPct':statistics.mean(r['spread'] for r in ledger) if n else None,'years':years,'equity':points,'eventStats':event_stats(ledger)}
def trade_rows(result,opportunities,oracle_data,window,events):
    ops={x['date']:x for x in opportunities};rows=[];balance=10000
    for i,t in enumerate(result['trades']):
        date=dt.datetime.fromtimestamp(t['entryTime']/1000,UTC).astimezone(AL).date().isoformat();op=ops[date];day=oracle_data['days'][window][op['session']];full=oracle_data['days']['full'].get(op['session'],day);f=day['features'];start=day['open']
        pts=lambda d:[[x,round((v/start-1)*100,5)] for x,v in zip(d['times'],d['prices'])]
        rows.append({'id':i+1,'date':date,'session':op['session'],'sessionWindow':window,'side':t['side'],'returnPct':t['pnl']/balance*100,'entryPrice':t['entryPrice'],'exitPrice':t['exitPrice'],'entryTime':t['entryTime'],'exitTime':t['exitTime'],'exitReason':t['exitReason'],'stop':t['exitReason']=='stop_loss','size':t['size'],'pnl':t['pnl'],'entryEquity':balance,'spreadCostPct':t['execution']['spreadCost']/balance*100,'funding':t['funding'],'movePct':f['move'],'efficiency':f['eff'],'agreementSteps':round(f['agree']*day['intervals']),'intervals':day['intervals'],'retracement':f['retrace'],'body':f['body'],'rangePct':f['range'],'signalBid':op['bid'],'reference':op['reference'],'pullbackBp':abs(op['bid']-op['reference'])/op['reference']*10000,'fillCounterMoveBp':(1 if t['side']=='long' else -1)*(op['reference']-t['entryPrice'])/op['reference']*10000,'checkpoints':pts(full),'recognitionPoints':pts(day),'recognitionFrom':day['times'][0],'recognitionThrough':day['times'][-1],'events':trade_events(events,op['session'],t['entryTime'])});balance+=t['pnl']
    return rows
def prepare_gaps(epic,spec,od,events):
    output={'spec':spec,'minimumGapBp':[0,5,15,30],'sessions':{}}
    for window in WINDOWS:
        rows=[];trades={};audits=[]
        for policy in spec['policies']:
            key=policy['id'];raw=load(OUT/f'{epic}-{window}-{key}-gaps.json');audits.append(raw['audit'])
            all_ops=od['opportunities'][window][key]
            for profile,result in zip(raw['profiles'],raw['runs']):
                gap=profile['minimumGapBp'];ops=[x for x in all_ops if abs(x['bid']-x['reference'])/x['reference']*10000>=gap]
                r=summarize(result,key,profile,len(ops),{x['date']:x for x in ops},events['events']);r.update(minimumGapBp=gap,sessionWindow=window)
                rows.append(r)
                if key=='current' and profile['leverage']==200 and profile['lossPct']==50:
                    trades[str(gap)]=trade_rows(result,ops,od,window,events['events'])
        assert len(rows)==1296 and all(a['allControlsExact'] for a in audits)
        output['sessions'][window]={'runs':rows,'trades':trades,'audit':{'exactControls':sum(a['zeroGapControls'] for a in audits),'allControlsExact':True}}
    (OUT/f'{epic}-gap-summary.json').write_text(json.dumps(output,separators=(',',':')))
    fields=[k for k in rows[0] if k not in ['winInterval','years','equity','eventStats']]
    with (OUT/f'{epic}-gap-risk-grid.csv').open('w',newline='')as f:
        w=csv.DictWriter(f,fieldnames=fields,lineterminator='\n');w.writeheader();w.writerows({k:r[k] for k in fields} for s in output['sessions'].values() for r in s['runs'])
    print(epic,'gap dimensions:2592 cases;648 zero-gap financial controls exact')
def prepare():
    specs={e:load(OUT/f'{e}-spec.json') for e in ['US500','US100']};policies=specs['US500']['policies'];oracles={e:oracle(e,policies) for e in specs};dates={d for x in oracles.values() for d in x['days']['full']};events=event_catalog(dates)
    for e,od in oracles.items():
        (OUT/f'{e}-signals.json').write_text(json.dumps({'inputSHA':od['inputSHA'],'opportunities':od['opportunities']},separators=(',',':')))
    (OUT/'event-calendar.json').write_text(json.dumps(events,separators=(',',':')))
    for epic,spec in specs.items():
        od=oracles[epic];runs=[];trades={};changed={};full_stats={}
        for policy in policies:
            key=policy['id'];raw=load(OUT/f'{epic}-{key}.json');opps=od['opportunities']['central'][key];ops={x['date']:x for x in opps}
            for profile,result in zip(raw['profiles'],raw['runs']):runs.append(summarize(result,key,profile,len(opps),ops,events['events']))
            baseline=next(r for r in raw['runs'] if r['leverage']==200 and r['params']['lossPct']==50)
            if key=='current':trades['central']=trade_rows(baseline,opps,od,'central',events['events'])
            full_raw=load(OLD/f"{'us100-' if epic=='US100' else ''}grid-{key}.json")
            full_opps=od['opportunities']['full'][key];full_ops={r['date']:r for r in full_opps}
            fref=next(r for r in full_raw['runs'] if r['leverage']==20 and r['params']['lossPct']==20)
            full_stats[key]=summarize(fref,key,{'id':'L20S20','leverage':20,'lossPct':20},len(full_opps),full_ops,events['events'])['eventStats']
            if key=='current':trades['full']=trade_rows(next(r for r in full_raw['runs'] if r['leverage']==200 and r['params']['lossPct']==50),full_opps,od,'full',events['events'])
            counts=collections.Counter()
            for date in set(od['days']['full'])&set(od['days']['central']):
                a=classify(od['days']['full'][date]['features'],{**BASE,**policy['params']},570,960);b=classify(od['days']['central'][date]['features'],{**BASE,**policy['params']},630,930)
                label='same' if a==b and a else 'neither' if a==b else 'fullOnly' if a and not b else 'centralOnly' if b and not a else 'opposite';counts[label]+=1
            changed[key]=dict(counts)
        assert len(runs)==324
        result={'spec':spec,'runs':runs,'trades':trades,'classificationChanges':changed,'fullEventStats':full_stats,'inputSHA':od['inputSHA'],'minuteRows':od['minuteRows'],'oracleOpportunityCounts':{w:{k:len(v) for k,v in p.items()} for w,p in od['opportunities'].items()}}
        (OUT/f'{epic}-summary.json').write_text(json.dumps(result,separators=(',',':')))
        fields=[k for k in runs[0] if k not in ['winInterval','years','equity','eventStats']]
        with (OUT/f'{epic}-central-risk-grid.csv').open('w',newline='')as f:w=csv.DictWriter(f,fieldnames=fields,lineterminator='\n');w.writeheader();w.writerows({k:r[k] for k in fields} for r in runs)
        print(epic,'opportunities',result['oracleOpportunityCounts'],'trades',[(w,len(t)) for w,t in trades.items()])
        if all((OUT/f'{epic}-{window}-{p["id"]}-gaps.json').exists() for window in WINDOWS for p in policies):prepare_gaps(epic,spec,od,events)
    print('Calendar:',events['taggedSessionCount'],'/',events['sessionCount'],'NY sessions; all new ledgers/oracle joins reconciled')
if __name__=='__main__':prepare()
