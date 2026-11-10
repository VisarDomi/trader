#!/usr/bin/env python3
"""Night Lab results as one read-only SQLite file, written once per published report.

The lab writes the database; the Trader UI server answers small per-section queries from it
(apps/ui/src/lib/server/night-lab.ts). Nothing data-sized lives in apps/ui/static or the UI build.

Tables hold the entities that make up nearly all of the report: every risk setting (runs), the
equity curves, the trade ledgers, the cohort and the hold benchmarks. Smaller heterogeneous parts
(specs, audits, selection notes) stay in a JSON skeleton whose placeholders point at those
tables, so the complete report.json is rebuilt byte for byte (`report`, and the export served at
/night-lab/report.json). CSV exports are stored gzip-compressed, compressed once here.

  python3 ops/lab/night_lab_db.py import --report report.json --exports DIR --out night-lab.db
  python3 ops/lab/night_lab_db.py report night-lab.db > report.json
  python3 ops/lab/night_lab_db.py publish night-lab.db DEST_DIR
"""
import argparse, copy, gzip, hashlib, json, os, pathlib, shutil, sqlite3, sys, time

SCHEMA = 1
FILE = 'night-lab.db'
ROOT = pathlib.Path(__file__).resolve().parents[2]
# The lab's own copy; nightly.sh republishes it to the dashboard's runtime folder when missing or changed.
LAB_DB = ROOT / 'apps/backend/data/night-lab' / FILE
CSV_EXPORTS = ['trades.csv', 'risk-grid.csv', 'us100-risk-grid.csv', 'us500-gap-risk-grid.csv', 'us100-gap-risk-grid.csv',
               'us500-exit-risk-grid.csv', 'us100-exit-risk-grid.csv']
REPORT_EXPORT = 'report.json'

DDL = '''
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- One row per risk setting. (epic, session_window, gap_bp, profit_pct, policy, profile) is unique across the
-- report; list/position keep the order of the published lists so report.json is rebuilt exactly.
CREATE TABLE runs(
  epic TEXT NOT NULL, session_window TEXT NOT NULL, gap_bp INTEGER NOT NULL, profit_pct INTEGER NOT NULL,
  policy TEXT NOT NULL, profile TEXT NOT NULL, leverage INTEGER, loss_pct REAL,
  n INTEGER, wins INTEGER, win_pct REAL, return_pct REAL, max_drawdown_pct REAL, worst_trade_pct REAL,
  target_hits INTEGER, stops INTEGER, deadline_exits INTEGER, rejected INTEGER,
  list TEXT NOT NULL, position INTEGER NOT NULL, record TEXT NOT NULL,
  UNIQUE(epic, session_window, gap_bp, profit_pct, policy, profile), UNIQUE(list, position));
CREATE INDEX runs_policy ON runs(epic, policy);
CREATE INDEX runs_profile ON runs(profile, policy);
-- Equity curves: daily points [time, equity] for selected profiles; the exit study holds the complete 1:20/20% set.
CREATE TABLE curves(
  epic TEXT NOT NULL, session_window TEXT NOT NULL, gap_bp INTEGER NOT NULL, profit_pct INTEGER NOT NULL,
  policy TEXT NOT NULL, profile TEXT NOT NULL, list TEXT NOT NULL, position INTEGER NOT NULL, points TEXT NOT NULL,
  UNIQUE(list, position));
CREATE INDEX curves_policy ON curves(epic, policy, profile);
-- Baseline-rule trade ledgers per index, NY window and minimum gap.
CREATE TABLE trades(
  epic TEXT NOT NULL, session_window TEXT NOT NULL, gap_bp INTEGER NOT NULL, id INTEGER NOT NULL,
  list TEXT NOT NULL, position INTEGER NOT NULL, record TEXT NOT NULL,
  UNIQUE(list, position));
CREATE INDEX trades_ledger ON trades(epic, session_window, gap_bp);
CREATE TABLE cohort(position INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, epic TEXT NOT NULL, role TEXT, record TEXT NOT NULL);
CREATE TABLE benchmarks(epic TEXT PRIMARY KEY, position INTEGER NOT NULL, record TEXT NOT NULL);
CREATE TABLE documents(name TEXT PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE exports(name TEXT PRIMARY KEY, content_type TEXT NOT NULL, bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, gzip BLOB NOT NULL);
'''


def dumps(value):
    # Exactly how build-night-lab.py has always written report.json.
    return json.dumps(value, separators=(',', ':'))


def split(report):
    """Report -> (skeleton, table rows). Placeholders {"$rows"|"$curves"|"$trades"|"$table"|"$doc": ...} mark moved parts."""
    s = copy.copy(report)
    runs, curves, trades = [], [], []

    def run_list(name, epic, rows, window=None, gap=None):
        for i, r in enumerate(rows):
            w = r.get('sessionWindow', window)
            g = r.get('minimumGapBp', gap)
            assert w in ('full', 'central') and g is not None and r['profitPct'] is not None, (name, i)
            runs.append((epic, w, g, r['profitPct'], r['policy'], r['profile'], r.get('leverage'), r.get('lossPct'),
                         r.get('n'), r.get('wins'), r.get('winPct'), r.get('returnPct'), r.get('maxDrawdownPct'),
                         r.get('worstTradePct'), r.get('targetHits'), r.get('stops'), r.get('deadlineExits'),
                         r.get('rejected'), name, i, dumps(r)))
        return {'$rows': name}

    def curve_map(name, epic, window, gap, profit, mapping):
        for i, (key, points) in enumerate(mapping.items()):
            policy, profile = key.split('/')
            curves.append((epic, window, gap, profit, policy, profile, name, i, dumps(points)))
        return {'$curves': name}

    def trade_list(name, epic, window, gap, rows):
        for i, t in enumerate(rows):
            trades.append((epic, window, gap, t['id'], name, i, dumps(t)))
        return {'$trades': name}

    s['trades'] = {}
    for key, rows in report['trades'].items():
        epic, _, central = key.partition('-')
        s['trades'][key] = trade_list('trades.' + key, epic, 'central' if central else 'full', 0, rows)
    s['instruments'] = []
    for inst in report['instruments']:
        e = inst['epic']
        x = copy.copy(inst)
        x['runs'] = run_list(f'{e}:runs', e, inst['runs'], 'full', 0)
        x['curves'] = curve_map(f'{e}:curves', e, 'full', 0, 0, inst['curves'])
        c = x['central'] = copy.copy(inst['central'])
        c['runs'] = run_list(f'{e}:central.runs', e, inst['central']['runs'], 'central', 0)
        c['curves'] = curve_map(f'{e}:central.curves', e, 'central', 0, 0, inst['central']['curves'])
        assert inst['central']['trades'] == report['trades'][e + '-central'], 'central ledger is published twice and must match'
        c['trades'] = {'$trades': f'trades.{e}-central'}
        g = x['gapStudy'] = copy.copy(inst['gapStudy'])
        g['sessions'] = {}
        for w, group in inst['gapStudy']['sessions'].items():
            y = g['sessions'][w] = copy.copy(group)
            y['runs'] = run_list(f'{e}:gap.{w}.runs', e, group['runs'], w)
            y['curves'] = {gap: curve_map(f'{e}:gap.{w}.curves.{gap}', e, w, int(gap), 0, m) for gap, m in group['curves'].items()}
            y['trades'] = {gap: trade_list(f'{e}:gap.{w}.trades.{gap}', e, w, int(gap), rows) for gap, rows in group['trades'].items()}
        z = x['exitStudy'] = copy.copy(inst['exitStudy'])
        z['runs'] = run_list(f'{e}:exit.runs', e, inst['exitStudy']['runs'])
        z['curves'] = {}
        for key, m in inst['exitStudy']['curves'].items():
            w, gap, profit = key.split('/')
            z['curves'][key] = curve_map(f'{e}:exit.curves.{key}', e, w, int(gap), int(profit), m)
        s['instruments'].append(x)
    cohort = [(i, r['id'], r['epic'], r.get('role'), dumps(r)) for i, r in enumerate(report['cohort'])]
    s['cohort'] = {'$table': 'cohort'}
    benchmarks = [(epic, i, dumps(b)) for i, (epic, b) in enumerate(report['benchmarks'].items())]
    s['benchmarks'] = {'$table': 'benchmarks'}
    documents = [(name, dumps(report[name])) for name in ('stocks', 'events')]
    for name in ('stocks', 'events'):
        s[name] = {'$doc': name}
    return s, dict(runs=runs, curves=curves, trades=trades, cohort=cohort, benchmarks=benchmarks, documents=documents)


def version_of(report_bytes, exports):
    h = hashlib.sha256(report_bytes)
    for name, _, raw in sorted(exports):
        h.update(name.encode() + b'\0' + hashlib.sha256(raw).digest())
    return h.hexdigest()[:16]


def write(report, csv_exports, out, source):
    """Write the report and its CSV exports to `out` atomically. csv_exports: [(name, content_type, bytes)]."""
    out = pathlib.Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    report_bytes = dumps(report).encode()
    exports = list(csv_exports) + [(REPORT_EXPORT, 'application/json', report_bytes)]
    skeleton, rows = split(report)
    partial = out.with_name('.' + out.name + '.partial')
    partial.unlink(missing_ok=True)
    db = sqlite3.connect(partial)
    try:
        db.execute('PRAGMA journal_mode=OFF')
        db.execute('PRAGMA page_size=8192')
        db.executescript(DDL)
        with db:
            db.executemany('INSERT INTO runs VALUES(' + ','.join('?' * 21) + ')', rows['runs'])
            db.executemany('INSERT INTO curves VALUES(?,?,?,?,?,?,?,?,?)', rows['curves'])
            db.executemany('INSERT INTO trades VALUES(?,?,?,?,?,?,?)', rows['trades'])
            db.executemany('INSERT INTO cohort VALUES(?,?,?,?,?)', rows['cohort'])
            db.executemany('INSERT INTO benchmarks VALUES(?,?,?)', rows['benchmarks'])
            db.executemany('INSERT INTO documents VALUES(?,?)', rows['documents'])
            db.executemany('INSERT INTO exports VALUES(?,?,?,?,?)', [
                (name, kind, len(raw), hashlib.sha256(raw).hexdigest(), gzip.compress(raw, 9, mtime=0)) for name, kind, raw in exports])
            meta = {'schema': SCHEMA, 'version': version_of(report_bytes, exports), 'generatedAt': report['generatedAt'],
                    'writtenAt': int(time.time() * 1000), 'source': source, 'skeleton': skeleton}
            db.executemany('INSERT INTO meta VALUES(?,?)', [(k, dumps(v)) for k, v in meta.items()])
        db.execute('ANALYZE')
        db.execute('VACUUM')
    except BaseException:
        db.close()
        partial.unlink(missing_ok=True)
        raise
    finally:
        db.close()
    rebuilt = report_text(partial)
    if rebuilt != report_bytes:
        partial.unlink()
        raise SystemExit('Night Lab database does not reproduce the report exactly; nothing written')
    with open(partial, 'rb') as f:
        os.fsync(f.fileno())
    os.replace(partial, out)
    return meta['version']


def connect(path):
    return sqlite3.connect(f'file:{pathlib.Path(path).resolve()}?mode=ro', uri=True)


def read_report(path):
    db = connect(path)
    try:
        meta = {k: json.loads(v) for k, v in db.execute('SELECT key, value FROM meta')}
        assert meta['schema'] == SCHEMA, f"Night Lab schema {meta['schema']} is not {SCHEMA}"
        lists = {}
        for table, column in (('runs', 'record'), ('curves', 'points'), ('trades', 'record')):
            extra = ', policy, profile' if table == 'curves' else ''
            for row in db.execute(f'SELECT list, position, {column}{extra} FROM {table} ORDER BY list, position'):
                lists.setdefault((table, row[0]), []).append(row)
        tables = {
            'cohort': [json.loads(r) for (r,) in db.execute('SELECT record FROM cohort ORDER BY position')],
            'benchmarks': {e: json.loads(r) for e, r in db.execute('SELECT epic, record FROM benchmarks ORDER BY position')},
        }
        docs = {n: json.loads(b) for n, b in db.execute('SELECT name, body FROM documents')}
    finally:
        db.close()

    def fill(v):
        if isinstance(v, dict):
            if '$rows' in v:
                return [json.loads(r[2]) for r in lists.get(('runs', v['$rows']), [])]
            if '$curves' in v:
                return {f'{r[3]}/{r[4]}': json.loads(r[2]) for r in lists.get(('curves', v['$curves']), [])}
            if '$trades' in v:
                return [json.loads(r[2]) for r in lists.get(('trades', v['$trades']), [])]
            if '$table' in v:
                return tables[v['$table']]
            if '$doc' in v:
                return docs[v['$doc']]
            return {k: fill(x) for k, x in v.items()}
        if isinstance(v, list):
            return [fill(x) for x in v]
        return v
    return fill(meta['skeleton'])


def benchmark(epic, path=LAB_DB):
    """One index's 1:1 hold benchmark as published (input hash, equity curve, returns)."""
    db = connect(path)
    try:
        row = db.execute('SELECT record FROM benchmarks WHERE epic=?', (epic,)).fetchone()
    finally:
        db.close()
    if not row:
        raise KeyError(epic)
    return json.loads(row[0])


def report_text(path):
    return dumps(read_report(path)).encode()


def info(path):
    db = connect(path)
    try:
        meta = {k: json.loads(v) for k, v in db.execute("SELECT key, value FROM meta WHERE key != 'skeleton'")}
        meta['rows'] = {t: db.execute(f'SELECT count(*) FROM {t}').fetchone()[0] for t in ('runs', 'curves', 'trades', 'cohort', 'exports')}
        return meta
    finally:
        db.close()


def server_dir():
    """The dashboard's runtime folder for the report on this machine (ops/server/runtime.sh), or None."""
    state = pathlib.Path.home() / '.local/share/hetzner-pc'
    return state / 'mirror/home/erdal/trader-ui/night-lab' if (state / 'ACTIVE').exists() else None


def publish(path, dest_dir):
    """Copy the database into the dashboard's runtime folder atomically; no-op when it is already there."""
    src, dest = pathlib.Path(path), pathlib.Path(dest_dir) / FILE
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size == src.stat().st_size and info(dest).get('version') == info(src).get('version'):
        return False
    tmp = dest.with_name('.' + FILE + '.partial')
    shutil.copyfile(src, tmp)
    with open(tmp, 'rb') as f:
        os.fsync(f.fileno())
    os.replace(tmp, dest)
    return True


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    i = sub.add_parser('import', help='store an already published report.json and its CSV exports')
    i.add_argument('--report', required=True)
    i.add_argument('--exports', required=True, help='folder with the CSV exports')
    i.add_argument('--out', default=str(LAB_DB))
    r = sub.add_parser('report', help='print the complete report.json')
    r.add_argument('db', nargs='?', default=str(LAB_DB))
    n = sub.add_parser('info')
    n.add_argument('db', nargs='?', default=str(LAB_DB))
    u = sub.add_parser('publish')
    u.add_argument('db')
    u.add_argument('dest')
    a = p.parse_args(argv)
    if a.cmd == 'import':
        raw = pathlib.Path(a.report).read_bytes()
        report = json.loads(raw)
        if dumps(report).encode() != raw:
            raise SystemExit('report.json is not in the canonical published form')
        folder = pathlib.Path(a.exports)
        version = write(report, [(name, 'text/csv', (folder / name).read_bytes()) for name in CSV_EXPORTS], a.out,
                        'import ' + pathlib.Path(a.report).name)
        print('Wrote', a.out, 'version', version)
    elif a.cmd == 'report':
        sys.stdout.buffer.write(report_text(a.db))
    elif a.cmd == 'info':
        print(json.dumps(info(a.db), indent=1))
    elif a.cmd == 'publish':
        print('Published' if publish(a.db, a.dest) else 'Already published', a.db, '->', a.dest)


if __name__ == '__main__':
    main()
