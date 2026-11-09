#!/usr/bin/env python3
"""Match fresh source-specific full-engine runs to their selected study cells."""
import json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
DATA=ROOT/'apps/backend/data'
selection=json.loads((ROOT/'research/night-cohort-20261109.json').read_text())
audit=[]
for a in selection['agents']:
    result=json.loads((DATA/'backtests/2024-01_2026-09'/f"{a['id'].replace('/','__')}__{a['epic']}__x{a['leverage']}.json").read_text())
    study=json.loads((DATA/'night-exit-study-20261109'/f"{a['epic']}-{a['sessionWindow']}-{a['policy']}.json").read_text())
    i=next(i for i,p in enumerate(study['profiles']) if p['minimumGapBp']==a['minimumGapBp'] and p['id']==a['profile'] and p['profitPct']==a['profitPct'])
    expected=study['runs'][i]
    assert result['codeHash']==a['codeHash'] and result['status']=='completed' and result['errors']==0
    assert result['metrics']==expected['metrics'],a['id']
    # New human-readable entry reasons include the window and gap. All other
    # trade fields, quotes, fills, protections, fees and cashflows must agree.
    trades=lambda rows:[{k:v for k,v in t.items() if k!='entryReason'} for t in rows]
    assert trades(result['trades'])==trades(expected['trades']),a['id']
    audit.append({'id':a['id'],'codeHash':a['codeHash'],'n':len(result['trades']),'metricsExact':True,'tradesExactExceptExpandedReason':True})
(DATA/'night-exit-study-20261109/verification.json').write_text(json.dumps(audit,indent=2)+'\n')
print('All nineteen full-engine source-specific results exactly match selected metrics and trades; only entry explanation text changes.')
