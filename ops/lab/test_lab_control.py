import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('lab_control', Path(__file__).with_name('lab-control.py'))
control = importlib.util.module_from_spec(spec)
spec.loader.exec_module(control)


class LabHoldTests(unittest.TestCase):
    def test_scoped_resume_keeps_other_holds_and_global_stop_wins(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'pause.json'
            original = {'paused_at': '2026-10-21T10:54:49Z', 'services': control.ALL_SERVICES,
                        'resumed_services': {'trader-forecaster.service': '2026-11-01T11:43:19Z'}}
            path.write_text(json.dumps(original))
            self.assertFalse(control.allowed(path))
            control.resume_hold(path)
            resumed = json.loads(path.read_text())
            self.assertTrue(control.allowed(path))
            self.assertEqual(resumed['services'], ['video-pipeline.service', 'trader-forecaster.service'])
            self.assertEqual(resumed['paused_at'], original['paused_at'])
            self.assertIn('trader-forecaster.service', resumed['resumed_services'])
            self.assertIn('trader-lab.service', resumed['resumed_services'])
            # A new heavy-resources-stop rewrites the full list: the lab is held again.
            path.write_text(json.dumps(original))
            self.assertFalse(control.allowed(path))

    def test_absent_and_malformed_holds(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'pause.json'
            self.assertTrue(control.allowed(path))
            for raw in ['{', '{}', 'null', '[1]', '{"services":42}', '{"services":[42]}']:
                path.write_text(raw)
                self.assertFalse(control.allowed(path), raw)
            path.write_text(json.dumps({'services': ['video-pipeline.service']}))
            self.assertTrue(control.allowed(path))


if __name__ == '__main__':
    unittest.main()
