#!/usr/bin/env python3
"""Reconcile all capital-profit exits against the frozen signal oracle and ledgers."""
import csv,json,pathlib,sys
from night_study_data import summarize
ROOT=pathlib.Path(__file__).resolve().parents[2]
DATA=ROOT/'apps/backend/data';OLD=DATA/'night-session-study-20261109';OUT=DATA/'night-exit-study-20261109'
def prepare(epics=('US500','US100')):
 events=json.loads((OLD/'event-calendar.json').read_text())['events']
 for epic in epics:
  spec=json.loads((OLD/f'{epic}-spec.json').read_text());oracle=json.loads((OLD/f'{epic}-signals.json').read_text());rows=[];curves={};controls=0
  for window in ['full','central']:
   for policy in spec['policies']:
    raw=json.loads((OUT/f'{epic}-{window}-{policy["id"]}.json').read_text());assert raw['audit']['allDeadlineControlsExact'];controls+=raw['audit']['deadlineControls']
    ops=oracle['opportunities'][window][policy['id']]
    for profile,result in zip(raw['profiles'],raw['runs']):
     gap=profile['minimumGapBp'];eligible=[o for o in ops if abs(o['bid']-o['reference'])/o['reference']*10000>=gap]
     r=summarize(result,policy['id'],profile,len(eligible),{o['date']:o for o in eligible},events)
     r.update(sessionWindow=window,minimumGapBp=gap,profitPct=profile['profitPct'])
     target=lambda t:t['exitReason']=='take_profit' or (t.get('exitNote')or'').startswith('capital take profit +')
     r['targetHits']=sum(target(t) for t in result['trades']);r['deadlineExits']=sum(t['exitReason']=='session_end' for t in result['trades'])
     r['otherExits']=len(result['trades'])-r['targetHits']-r['deadlineExits']-r['stops'];assert r['otherExits']>=0
     r['funding']=sum(t['funding'] for t in result['trades'])
     assert abs(r['funding'])<1e-6, 'Night exits unexpectedly cross a funding cutoff'
     if not profile['profitPct']:assert r['targetHits']==0
     rows.append({k:v for k,v in r.items() if k!='equity'})
     if profile['id']=='L20S20':curves.setdefault(f"{window}/{gap}/{profile['profitPct']}",{})[policy['id']+'/L20S20']=r['equity']
  assert len(rows)==10368 and controls==2592
  assert len({(r['sessionWindow'],r['minimumGapBp'],r['profitPct'],r['policy'],r['profile']) for r in rows})==10368
  summary={'profitPct':[0,20,50,100],'runs':rows,'curves':curves,'audit':{'deadlineControls':controls,'allDeadlineControlsExact':True},'sourceHash':raw['referenceHash']}
  (OUT/f'{epic}-summary.json').write_text(json.dumps(summary,separators=(',',':')))
  fields=[k for k in rows[0] if k not in ['years','winInterval','eventStats']]
  with (OUT/f'{epic.lower()}-exit-risk-grid.csv').open('w',newline='') as f:
   w=csv.DictWriter(f,fieldnames=fields,lineterminator='\n');w.writeheader();w.writerows({k:r[k] for k in fields} for r in rows)
  print(epic,'10368 cases,2592 deadline controls exact;target exits',sum(r['targetHits'] for r in rows))
if __name__=='__main__':prepare(sys.argv[1:] or ('US500','US100'))
