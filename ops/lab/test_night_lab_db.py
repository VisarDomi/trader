import json, pathlib, sqlite3, tempfile, unittest
import night_lab_db as nl


def run(policy, profile, profit=0, **extra):
    return {'policy': policy, 'profile': profile, 'leverage': 20, 'lossPct': 20, 'profitPct': profit, 'n': 3, 'wins': 2, 'winPct': 66.7,
            'returnPct': 1.5, 'maxDrawdownPct': 2.25, 'worstTradePct': -1.0, 'stops': 0, 'rejected': 0, 'targetHits': 0,
            'deadlineExits': 3, 'otherExits': 0, **extra}


def report():
    """The smallest report with every part the published one has, including the duplicated central ledger."""
    trade = lambda i, w: {'id': i, 'sessionWindow': w, 'side': 'long', 'returnPct': 0.1, 'minimumGapBp': 0}
    curve = [[1704067200000, 10000], [1704672000000, 10010.5]]
    inst = lambda e: {
        'epic': e, 'spec': {'policies': [{'id': 'current', 'label': 'Current'}], 'stops': [20], 'leverageTiers': [20]},
        'runs': [run('current', 'L20S20', years={'2024': {'n': 1}})],
        'curves': {'current/L20S20': curve},
        'central': {'spec': {'x': 1}, 'runs': [run('current', 'L20S20')], 'curves': {'current/L20S20': curve}, 'trades': [trade(2, 'central')]},
        'centralQuoteChecks': [], 'classificationChanges': {'current': {}}, 'fullEventStats': {},
        'gapStudy': {'minimumGapBp': [0, 5], 'sessions': {w: {'runs': [run('current', 'L20S20', sessionWindow=w, minimumGapBp=5)],
                                                               'curves': {'5': {'current/L20S20': curve}}, 'trades': {'5': [trade(3, w)]}, 'audit': {'ok': True}}
                                                           for w in ('full', 'central')}},
        'exitStudy': {'runs': [run('current', p, 20, sessionWindow=w, minimumGapBp=0) for w in ('full', 'central') for p in ('L20S20', 'L1S50')],
                      'curves': {f'{w}/0/20': {'current/L20S20': curve} for w in ('full', 'central')}, 'audit': {}}}
    return {'generatedAt': '2026-11-09T00:00:00+00:00', 'years': 2.75, 'window': ['2024-01-01', '2026-09-30'],
            'benchmarks': {e: {'epic': e, 'returnPct': 12.5, 'equity': curve, 'inputSHA': 'ab' * 32} for e in ('US500', 'US100')},
            'stocks': {'rows': [{'ticker': 'AAPL', 'weight': 0.1}]}, 'cohort': [{'id': 'visar/a', 'epic': 'US500', 'role': 'base', 'x': 'é'}],
            'instruments': [inst('US500'), inst('US100')],
            'trades': {k: [trade(1 if '-' not in k else 2, 'central' if '-' in k else 'full')] for k in ('US500', 'US500-central', 'US100', 'US100-central')},
            'events': {'events': [], 'sessionCount': 10}, 'gapThresholds': [0, 5], 'takeProfitTargets': [0, 20], 'caseCount': 4, 'selection': {'method': 'test'}}


class NightLabDbTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.db = pathlib.Path(self.dir.name) / nl.FILE

    def tearDown(self):
        self.dir.cleanup()

    def test_report_is_rebuilt_byte_for_byte_and_stored_as_rows(self):
        r = report()
        version = nl.write(r, [('trades.csv', 'text/csv', b'a,b\n1,2\n')], self.db, 'test')
        self.assertEqual(nl.report_text(self.db), nl.dumps(r).encode())
        self.assertEqual(nl.info(self.db)['version'], version)
        db = sqlite3.connect(self.db)
        # Every run is addressable by its setting; the published lists keep their order.
        self.assertEqual(db.execute('SELECT count(*) FROM runs').fetchone()[0], 2 * (1 + 1 + 2 + 4))
        self.assertEqual(db.execute("SELECT session_window, gap_bp FROM runs WHERE list='US500:central.runs'").fetchone(), ('central', 0))
        self.assertEqual(db.execute("SELECT profit_pct FROM runs WHERE epic='US100' AND profile='L1S50' AND session_window='central'").fetchone(), (20,))
        # The central ledger is published twice but stored once.
        self.assertEqual(db.execute("SELECT count(*) FROM trades WHERE epic='US500' AND session_window='central' AND gap_bp=0").fetchone()[0], 1)
        names = {n for (n,) in db.execute('SELECT name FROM exports')}
        self.assertEqual(names, {'trades.csv', 'report.json'})

    def test_version_follows_content_and_publish_is_atomic_and_idempotent(self):
        r = report()
        v1 = nl.write(r, [], self.db, 'test')
        dest = pathlib.Path(self.dir.name) / 'server'
        self.assertTrue(nl.publish(self.db, dest))
        self.assertFalse(nl.publish(self.db, dest))
        self.assertEqual(nl.report_text(dest / nl.FILE), nl.report_text(self.db))
        r['stocks']['rows'][0]['weight'] = 0.2
        self.assertNotEqual(nl.write(r, [], self.db, 'test'), v1)
        self.assertTrue(nl.publish(self.db, dest))
        self.assertEqual(list(dest.iterdir()), [dest / nl.FILE])

    def test_a_report_with_two_settings_for_one_cell_is_refused(self):
        r = report()
        r['instruments'][0]['exitStudy']['runs'].append(dict(r['instruments'][0]['exitStudy']['runs'][0]))
        with self.assertRaises(sqlite3.IntegrityError):
            nl.write(r, [], self.db, 'test')
        self.assertEqual(list(self.db.parent.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
