#!/usr/bin/env python3
import argparse,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--team',required=True);p.add_argument('--device',required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[3]
print(json.dumps(dict(repo='trader',apps=[dict(name='trader',root=str(root),app='apps/ios/build/Release-iphoneos/Trader.app',bundleIds=['com.visar.Trader.paid'],inputs=['apps/ios/TraderApp','apps/ios/Resources','apps/ios/Kit','apps/ios/scripts/project.py','apps/ios/scripts/build.py'],build=['/usr/bin/python3','apps/ios/scripts/build.py'],environment={'DEVELOPMENT_TEAM':a.team,'SIGNING_DEVICE':a.device})])))
