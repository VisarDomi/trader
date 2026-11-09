#!/usr/bin/env python3
"""Reproducible user-requested selection on inspected history, never validation."""
import collections,json,math,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
D=json.loads((ROOT/'apps/ui/static/night-lab/report.json').read_text())
TIERS={1:3,2:0,3:2,5:4,10:5,20:3,50:5,100:3,200:2}
# Free slots plus the nineteen replaced assignments; no other strategy is displaced.
roles={
 'US500':[
  ('frequent-core','central','current',0,None),
  ('frequent-gap','central','current',5,None),
  ('frequent-reversal','central','reversal50',0,None),
  ('frequent-reversal-gap','central','reversal50',5,None),
  ('frequent-small','central','current',0,1),
  ('full-steps','full','steps16',5,None),
  ('full-reversal','full','reversal35',0,None),
  ('central-body','central','body80',None,None),
  ('central-steps','central','steps16',5,None)],
 'US100':[
  ('frequent-core','central','current',0,None),
  ('frequent-gap','central','current',5,None),
  ('frequent-reversal','central','reversal50',0,None),
  ('frequent-small','central','current',0,5),
  ('frequent-gap-small','central','current',5,1),
  ('central-reversal','central','reversal35',0,None),
  ('large-gap','central','steps16',15,None),
  ('largest-gap','central','current',30,None),
  ('full-steps','full','steps16',5,3),
  ('central-body','central','body80',0,None)]}
def distance(a,b):
 return (.25*(a['sessionWindow']!=b['sessionWindow'])+.25*(a['policy']!=b['policy'])+
         .2*abs(a['minimumGapBp']-b['minimumGapBp'])/30+
         .2*abs(math.log(a['leverage']/b['leverage']))/math.log(200)+
         .1*abs(a['lossPct']-b['lossPct'])/45)
all_rows={}
for inst in D['instruments']:
 rows=[dict(r,sessionWindow=w,minimumGapBp=0) for w,rs in [('full',inst['runs']),('central',inst['central']['runs'])] for r in rs]
 for w in ['full','central']:rows+=inst['gapStudy']['sessions'][w]['runs']
 all_rows[inst['epic']]=rows
selected=[];used=collections.Counter()
for i in range(10):
 for epic in ['US500','US100']:
  if i>=len(roles[epic]):continue
  role,window,policy,gap,max_tier=roles[epic][i]
  candidates=[r for r in all_rows[epic] if r['sessionWindow']==window and r['policy']==policy and (gap is None or r['minimumGapBp']==gap)
    and r.get('status','completed')=='completed' and r['returnPct']>0 and r['maxDrawdownPct']<=40
    and r['n']>=(18 if gap==30 else 20) and (not max_tier or r['leverage']<=max_tier)
    and (role!='full-reversal' or r['leverage']>=100)
    and used[r['leverage']]<TIERS[r['leverage']]]
  # Financially identical loose stops are one historical candidate, not evidence of diversity.
  unique={}
  for r in candidates:
   key=(r['minimumGapBp'],r['leverage'],r['n'],r['wins'],round(r['returnPct'],8),round(r['maxDrawdownPct'],8),r['stops'])
   prior=unique.get(key)
   if prior is None or (abs(r['lossPct']-20),r['lossPct'])<(abs(prior['lossPct']-20),prior['lossPct']):unique[key]=r
  candidates=list(unique.values());assert candidates,(epic,role)
  for r in candidates:
   gain=math.log1p(r['returnPct']/100);r['quality']=gain/(.05+r['maxDrawdownPct']/100)+gain*.5
  best=max(r['quality'] for r in candidates)
  # Require >=75% of the role's best risk-adjusted score before maximizing parameter distance.
  band=[r for r in candidates if r['quality']>=best*.75]
  same=[r for r in selected if r['epic']==epic]
  row=max(band,key=lambda r:(min((distance(r,b) for b in same),default=1)*.45+.55*r['quality']/best,r['n'],-r['lossPct']))
  row={**row,'epic':epic,'role':role,'roleBestQuality':best}
  row['id']='visar-night-v2-'+epic.lower()+'/'+role
  row['params']={**next(p['params'] for p in next(x for x in D['instruments'] if x['epic']==epic)['spec']['policies'] if p['id']==policy),
    'sessionStart':630 if window=='central' else 570,'sessionEnd':930 if window=='central' else 960,
    'minPullbackBp':row['minimumGapBp'],'lossPct':row['lossPct']}
  selected.append(row);used[row['leverage']]+=1
assert len(selected)==19 and sum(r['role'].startswith('frequent-') for r in selected)==10
assert {r['minimumGapBp'] for r in selected}=={0,5,15,30}
target=ROOT/'research/night-cohort-20261109.json'
prior=json.loads(target.read_text())['priorCohort'] if target.exists() else D['cohort']
selection={'date':'2026-11-09','window':D['window'],'method':'Nineteen performance/diversity/frequency roles fixed from the expanded finite study. Positive total return, <=40% portfolio drawdown, >=20 fills (18 only for the 30bp endpoint). Two small-size roles retain a 1:1 endpoint; the full-session reversal has a >=1:100 risk endpoint. Prefer 20% among identical nonbinding stops. Keep >=75% of each role’s best log-return/(0.05+DD)+0.5*log-return, then balance 55% relative quality/45% minimum parameter distance. Ten higher-frequency roles are deliberate. Capacity counts are frozen from the pre-change review; no unrelated incumbent is displaced. All history has been inspected; this is not validation.',
 'tierBudget':TIERS,'tierUse':dict(used),'priorCohort':prior,'agents':selected}
(ROOT/'research/night-cohort-20261109.json').write_text(json.dumps(selection,indent=2)+'\n')
for r in selected:print(r['epic'],r['role'],r['sessionWindow'],r['policy'],r['minimumGapBp'],r['profile'],'N',r['n'],'/yr',round(r['tradesPerYear'],1),'return',round(r['returnPct'],1),'DD',round(r['maxDrawdownPct'],1))
print('Tiers',dict(used),'median frequency',sorted(r['tradesPerYear'] for r in selected)[9])
