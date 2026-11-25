#!/usr/bin/env python3
"""Build Night Lab cohort summary and hold benchmarks from current NY-clock backtests."""
import array, datetime as dt, hashlib, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
UTC = dt.timezone.utc
GRID_DAY = {
    'Standard': 'standard',
    'Move ≥0.5%': 'big-move',
    'Body ≥80% of range': 'strong-day',
    '≥62% of steps agree': 'steady-day',
    'Net move ≥30% of range': 'loose-body',
    'Any up or down day': 'any-day',
}
GRID_SIDE = {'previous day': 'rule', 'always long': 'long', 'random': 'random'}


def hold(epic: str) -> dict:
    raw = (ROOT / f'apps/backend/data/candles/{epic}_1704067200000_1790812800000.f64').read_bytes()
    a = array.array('d')
    a.frombytes(raw)
    entry = a[1] + a[5]
    peak = 10000.0
    dd = 0.0
    for i in range(0, len(a), 7):
        _, _, _, _, c, _, _ = a[i:i + 7]
        equity = 10000.0 * c / entry
        if equity > peak:
            peak = equity
        draw = 1.0 - equity / peak
        if draw > dd:
            dd = draw
    return {
        'epic': epic,
        'returnPct': (a[-3] / entry - 1.0) * 100.0,
        'finalEquity': 10000.0 * a[-3] / entry,
        'entryAsk': entry,
        'exitBid': a[-3],
        'from': a[0],
        'through': a[-7] + 60000.0,
        'maxDrawdownPct': dd * 100.0,
        'funding': 0,
        'exposure': 1,
        'inputSHA': hashlib.sha256(raw).hexdigest(),
    }


def main() -> None:
    benchmarks = {epic: hold(epic) for epic in ('US500', 'US100')}
    selection = json.loads((ROOT / 'research/night-cohort-v5-20261125.json').read_text())
    cohort = []
    for chosen in selection['members']:
        file = (
            ROOT
            / 'apps/backend/data/backtests/2024-01_2026-09'
            / f"{chosen['id'].replace('/', '__')}__{chosen['epic']}__x{chosen['leverage']}.json"
        )
        r = json.loads(file.read_text())
        assert r['codeHash'] == chosen['codeHash'] and r['agentId'] == chosen['id'] and r['leverage'] == chosen['leverage']
        c = chosen['coordinates']
        assert c['lossPct'] == 50 and c['window'] in ('central', 'full') and c['gapBp'] in (None, 0, 5, 15, 30) and c['leverage'] in (20, 200)
        meta = {k: chosen[k] for k in ('sessionWindow', 'minimumGapBp', 'policy', 'role', 'name', 'dimension', 'explores', 'coordinates', 'comparesWith')}
        if chosen['role'] == 'control':
            meta.update({k: chosen[k] for k in ('partner', 'direction')})
        gap = 'no-pullback' if c['gapBp'] is None else f"gap-{c['gapBp']}bp"
        meta['gridCell'] = f"{c['window']}/{GRID_DAY[c['day']]}/{gap}/x{c['leverage']}/{GRID_SIDE[c['side']]}"
        cohort.append({
            'id': r['agentId'],
            'epic': r['epic'],
            'leverage': r['leverage'],
            'lossPct': r['params']['lossPct'],
            'profitPct': r['params'].get('profitPct', 0),
            'params': r['params'],
            'metrics': {k: v for k, v in r['metrics'].items() if k != 'monthly'},
            'codeHash': r['codeHash'],
            'benchmarkEpic': r['epic'],
            'benchmarkExcessPp': r['metrics']['totalReturn'] * 100.0 - benchmarks[r['epic']]['returnPct'],
            **meta,
        })
    assert len(cohort) == 20 and sum(r['epic'] == 'US500' for r in cohort) == 10

    ui_server = ROOT / 'apps/ui/src/lib/server'
    (ui_server / 'night-lab-cohort.json').write_text(
        json.dumps([{k: r[k] for k in ('id', 'codeHash', 'epic', 'leverage')} for r in cohort], indent=2) + '\n'
    )
    summary = {
        'schema': 2,
        'generatedAt': dt.datetime.now(UTC).isoformat(),
        'years': (dt.date(2026, 10, 1) - dt.date(2024, 1, 1)).days / 365.25,
        'window': ['2024-01-01', '2026-09-30'],
        'benchmarks': benchmarks,
        'selection': {k: selection[k] for k in ('date', 'revision', 'method', 'base')},
        'cohort': cohort,
    }
    (ui_server / 'night-lab-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(f"Wrote night-lab-cohort.json and night-lab-summary.json ({len(cohort)} NY-clock members)")


if __name__ == '__main__':
    main()
