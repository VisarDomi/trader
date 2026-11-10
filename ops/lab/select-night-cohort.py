#!/usr/bin/env python3
"""Reproducible user-requested selection on inspected history, never validation."""
import collections,json,math,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
import night_lab_db
D=night_lab_db.read_report(night_lab_db.LAB_DB)  # the published report, rebuilt from the Night Lab database
EXITS=ROOT/'apps/backend/data/night-exit-study-20261109'
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
EXIT_ROLES={
 'US500':{'frequent-core':[0,20],'frequent-gap':[20],'frequent-reversal':[0,50],
  'frequent-reversal-gap':[50],'frequent-small':[0],'full-steps':[20],
  'full-reversal':[0,50],'central-body':[100],'central-steps':[0,20]},
 'US100':{'frequent-core':[20],'frequent-gap':[100],'frequent-reversal':[50],
  'frequent-small':[0],'frequent-gap-small':[0],'central-reversal':[100],
  'large-gap':[20],'largest-gap':[50],'full-steps':[0,20],'central-body':[20]}}
def distance(a,b):
 x,y=a['profitPct'],b['profitPct'];exit_distance=float(bool(x)!=bool(y)) if not x or not y else abs(math.log(x/y))/math.log(5)
 return (.2*(a['sessionWindow']!=b['sessionWindow'])+.2*(a['policy']!=b['policy'])+
         .16*abs(a['minimumGapBp']-b['minimumGapBp'])/30+
         .16*abs(math.log(a['leverage']/b['leverage']))/math.log(200)+
         .08*abs(a['lossPct']-b['lossPct'])/45+.2*exit_distance)
all_rows={}
for inst in D['instruments']:
 rows=json.loads((EXITS/f"{inst['epic']}-summary.json").read_text())['runs']
 all_rows[inst['epic']]=rows
selected=[];used=collections.Counter()
for i in range(10):
 for epic in ['US500','US100']:
  if i>=len(roles[epic]):continue
  role,window,policy,gap,max_tier=roles[epic][i]
  candidates=[r for r in all_rows[epic] if r['sessionWindow']==window and r['policy']==policy and (gap is None or r['minimumGapBp']==gap)
    and r['profitPct'] in EXIT_ROLES[epic][role]
    and r.get('status','completed')=='completed' and r['returnPct']>0 and r['maxDrawdownPct']<=40
    and r['n']>=(18 if gap==30 else 20) and (not max_tier or r['leverage']<=max_tier)
    and (role!='full-reversal' or r['leverage']>=100)
    and not (r['leverage']==100 and role!='full-reversal' and not any(a['role']=='full-reversal' for a in selected) and used[100]>=TIERS[100]-1)
    and (not role.startswith('frequent-') or r['tradesPerYear']>=18)
    and used[r['leverage']]<TIERS[r['leverage']]]
  # Financially identical loose stops are one historical candidate, not evidence of diversity.
  unique={}
  for r in candidates:
   key=(r['minimumGapBp'],r['leverage'],r['n'],r['wins'],round(r['returnPct'],8),round(r['maxDrawdownPct'],8),r['stops'])
   prior=unique.get(key)
   if prior is None or (bool(r['profitPct']),abs(r['lossPct']-20),r['lossPct'])<(bool(prior['profitPct']),abs(prior['lossPct']-20),prior['lossPct']):unique[key]=r
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
    'minPullbackBp':row['minimumGapBp'],'lossPct':row['lossPct'],'profitPct':row['profitPct']}
  selected.append(row);used[row['leverage']]+=1
assert len(selected)==19 and sum(r['role'].startswith('frequent-') for r in selected)==10
assert {r['minimumGapBp'] for r in selected}=={0,5,15,30}
assert {r['profitPct'] for r in selected}=={0,20,50,100}
target=ROOT/'research/night-cohort-20261109.json'
prior=json.loads(target.read_text())['priorCohort'] if target.exists() else D['cohort']
previous=json.loads(target.read_text())
selection={'date':'2026-11-09','revision':3,'profitTargets':[0,20,50,100],'window':D['window'],'method':'Nineteen performance/diversity/frequency/exit roles on inspected finite history. Exit choices are deadline-only or +20/+50/+100% of entry capital with the same loss stop/deadline. Positive return, <=40% portfolio DD, >=20 fills (18 only at30bp). Two 1:1 endpoints and a full-session >=1:100 endpoint. Prefer deadline-only for financially identical allowed exit choices, then20% for identical loss limits. Prescribed nonbinding profit endpoints stay explicit through target-hit counts. Keep >=75% of role-best log-return/(0.05+DD)+0.5*log-return, then55% relative quality/45% minimum parameter distance including exit. Ten >=18/year roles. Frozen tier budget; no unrelated incumbent displaced. Not independent validation.',
 'tierBudget':TIERS,'tierUse':dict(used),'priorCohort':prior,'previousCohort':previous.get('previousCohort',D['cohort']),'agents':selected}
(ROOT/'research/night-cohort-20261109.json').write_text(json.dumps(selection,indent=2)+'\n')
for r in selected:print(r['epic'],r['role'],r['sessionWindow'],r['policy'],r['minimumGapBp'],r['profile'],'profit',r['profitPct'],'hits',r['targetHits'],'N',r['n'],'/yr',round(r['tradesPerYear'],1),'return',round(r['returnPct'],1),'DD',round(r['maxDrawdownPct'],1))
print('Tiers',dict(used),'median frequency',sorted(r['tradesPerYear'] for r in selected)[9])
