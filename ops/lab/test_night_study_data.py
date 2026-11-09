import unittest
from unittest.mock import patch
import night_study_data as study
class EventContextTests(unittest.TestCase):
    def test_date_only_context_is_not_claimed_known_and_later_reports_are_identified(self):
        base={'sessionDate':'2025-06-12','id':'test','label':'Major event','category':'geopolitics','timing':'test','sources':[]}
        rows=study.trade_events([base,{**base,'id':'later','reportedAt':'2025-06-13T05:00:00Z'},{**base,'id':'earlier','reportedAt':'2025-06-13T00:00:00Z'}],'2025-06-12',1749778020000)
        self.assertIsNone(rows[0]['knownAtEntry']);self.assertFalse(rows[1]['knownAtEntry']);self.assertTrue(rows[2]['knownAtEntry'])
        self.assertEqual(study.trade_events([base],'2025-06-11',1749778020000),[])
    def test_weekend_shock_attaches_once_to_first_observed_session(self):
        catalog={'events':[{'id':'weekend','date':'2025-02-01','attach':'next-session'}],'maxTaggedSessionShare':1}
        with patch.object(study,'load',return_value=catalog),patch.object(study,'calendar',return_value={'FOMC':set(),'BOJ':set()}):
            result=study.event_catalog(['2025-01-31','2025-02-03','2025-02-04'])
        self.assertEqual(result['events'][0]['sessionDate'],'2025-02-03');self.assertEqual(result['taggedSessionCount'],1)
    def test_sparse_context_statistics_do_not_claim_a_filtered_portfolio_return(self):
        r=study.event_stats([{'ret':10,'events':[{'knownAtEntry':None}]},{'ret':-5,'events':[]}])
        self.assertEqual(r[0]['n'],1);self.assertEqual(r[1]['n'],1);self.assertEqual(r[1]['dateOnly'],1);self.assertEqual(r[1]['meanPct'],10)
if __name__=='__main__':unittest.main()
