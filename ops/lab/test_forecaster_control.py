import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('forecaster_control', Path(__file__).with_name('forecaster-control.py'))
control = importlib.util.module_from_spec(spec)
spec.loader.exec_module(control)

class ForecasterHoldTests(unittest.TestCase):
    def test_scoped_resume_survives_reload_and_global_stop_wins(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'pause.json'
            original = {'paused_at': '2026-10-21T10:54:49Z', 'services': control.ALL_SERVICES, 'requires_explicit_user_resume': True}
            path.write_text(json.dumps(original))
            self.assertFalse(control.allowed(path))
            control.resume_hold(path)
            resumed = json.loads(path.read_text())
            self.assertTrue(control.allowed(path))
            self.assertEqual(resumed['services'], control.ALL_SERVICES[:-1])
            self.assertEqual(resumed['paused_at'], original['paused_at'])
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            path.write_text(json.dumps(original))
            self.assertFalse(control.allowed(path))

    def test_absent_legacy_and_malformed_holds(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'pause.json'
            self.assertTrue(control.allowed(path))
            for raw in ['{', '{}', 'null', '[1]', '{"services":42}', '{"services":[42]}']:
                path.write_text(raw)
                self.assertFalse(control.allowed(path), raw)
            path.write_text('{}')
            control.resume_hold(path)
            self.assertTrue(control.allowed(path))
            self.assertIn('trader-lab.service', json.loads(path.read_text())['services'])

if __name__ == '__main__':
    unittest.main()
