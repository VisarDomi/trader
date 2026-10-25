#!/usr/bin/env python3
"""Build Trader using the shared signing lock, or unsigned for the simulator."""
import argparse,fcntl,json,os,subprocess,sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--simulator',action='store_true');a=p.parse_args()
root=Path(__file__).resolve().parents[1]
def build():
 subprocess.run([sys.executable,str(root/'scripts/project.py')],check=True)
 cmd=['xcodebuild','-project',str(root/'build/Trader.xcodeproj'),'-scheme','Trader','-configuration','Release','-derivedDataPath',str(root/'build/DerivedData'),'-jobs','2','SYMROOT='+str(root/'build')]
 if a.simulator:cmd+=['-sdk','iphonesimulator','-destination','generic/platform=iOS Simulator','CODE_SIGNING_ALLOWED=NO']
 else:
  config=json.loads((Path.home()/'Developer/ios-tools/ios-tools.local.json').read_text())
  team=os.environ.get('DEVELOPMENT_TEAM',config['team']);device=os.environ.get('SIGNING_DEVICE',config['device'])
  cmd+=['-sdk','iphoneos','-destination','generic/platform=iOS','DEVELOPMENT_TEAM='+team,'-allowProvisioningUpdates','-allowProvisioningDeviceRegistration']
 subprocess.run(cmd+['build'],cwd=root,check=True)
if a.simulator:build()
else:
 lockpath=Path.home()/'Library/Caches/ios-app-refresh/signing.lock';lockpath.parent.mkdir(parents=True,exist_ok=True)
 with lockpath.open('a') as lock:
  inherited=os.environ.get('IOS_REFRESH_LOCK_FD')
  if inherited:
   e=lockpath.stat();v=os.fstat(int(inherited))
   if (e.st_dev,e.st_ino)!=(v.st_dev,v.st_ino):raise SystemExit('Invalid signing lock')
  else:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  build()
