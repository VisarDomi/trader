#!/usr/bin/env python3
"""One-way sync, GUI signing, verification and in-place installation on an unlocked paired phone."""
import argparse,json,shlex,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
MAC='/Users/visar/Developer/trader/apps/ios'
BUNDLE='com.visar.Trader.paid'
def remote(program):return subprocess.run(['ssh','-o','BatchMode=yes','mac','python3 -'],input=program.encode(),check=True)
def sync():
 subprocess.run(['ssh','mac','mkdir -p '+MAC],check=True)
 subprocess.run(['rsync','-az','--delete','--exclude=build','--exclude=.build','--exclude=.swiftpm','--exclude=Private',str(ROOT/'apps/ios')+'/', 'mac:'+MAC+'/'],check=True)
def build(simulator=False):
 sync()
 if simulator:remote(f"import subprocess;subprocess.run(['/usr/bin/python3',{MAC!r}+'/scripts/build.py','--simulator'],check=True)");return
 remote(f'''import os,subprocess,pathlib,plistlib,json
tools=pathlib.Path.home()/'Developer/ios-tools'
subprocess.run(['/usr/bin/python3',str(tools/'renewal/scripts/configure-refresh.py'),{MAC!r}],check=True)
deliver=['/usr/bin/python3',str(tools/'renewal/scripts/deliver.py')]
flags=['--repo','trader','--app','trader','--bundle',{BUNDLE!r}]
subprocess.run(deliver+['begin']+flags,check=True)
subprocess.run(['sudo','-n','launchctl','asuser',str(os.getuid()),'sudo','-n','-H','-u',os.environ['USER'],'/usr/bin/caffeinate','-i','/usr/bin/python3',{MAC!r}+'/scripts/build.py'],check=True)
app=pathlib.Path({MAC!r})/'build/Release-iphoneos/Trader.app'
info=plistlib.loads((app/'Info.plist').read_bytes())
settings=json.loads((tools/'ios-tools.local.json').read_text())
profile=plistlib.loads(subprocess.check_output(['security','cms','-D','-i',str(app/'embedded.mobileprovision')],stderr=subprocess.DEVNULL))
assert info['CFBundleIdentifier']=={BUNDLE!r}
assert settings['team'] in profile['TeamIdentifier'] and settings['device'] in profile['ProvisionedDevices']
subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
subprocess.run(deliver+['built']+flags,check=True)
print('Signed Trader verified; source '+info['TraderSourceRevision']+'; profile expires '+str(profile['ExpirationDate']))
''')
def install():
 # Device discovery is a bounded shared repair, never an invitation to reset trust or uninstall apps.
 remote('''import subprocess,json,pathlib
tools=pathlib.Path.home()/'Developer/ios-tools'
cfg=json.loads((tools/'ios-tools.local.json').read_text())
subprocess.run([str(tools/'native/scripts/phone-pairing'),'--now'])
p=pathlib.Path('/tmp/trader-install-lock.json')
r=subprocess.run(['xcrun','devicectl','device','info','lockState','--device',cfg['device'],'--timeout','15','--json-output',str(p)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
if r.returncode:raise SystemExit('Phone is not reachable; signed Trader is ready but was not installed.')
state=json.loads(p.read_text()).get('result',{})
if state.get('passcodeRequired') is not False or state.get('unlockedSinceBoot') is not True:raise SystemExit('Phone is locked; signed Trader is ready but was not installed.')
''')
 pairing=ROOT/'apps/ios/Private/primary-phone.json'
 if not pairing.exists():raise SystemExit('Run ops/server/native-access.py prepare before installing')
 remote('from pathlib import Path; p=Path.home()/"Library/Application Support/TraderProvisioning";p.mkdir(parents=True,exist_ok=True);p.chmod(0o700)')
 subprocess.run(['scp','-q',str(pairing),'mac:/Users/visar/Library/Application Support/TraderProvisioning/primary-phone.json'],check=True)
 remote(f'''import subprocess,pathlib,json,os,time
tools=pathlib.Path.home()/'Developer/ios-tools';cfg=json.loads((tools/'ios-tools.local.json').read_text());device=cfg['device']
app=pathlib.Path({MAC!r})/'build/Release-iphoneos/Trader.app'
seed=pathlib.Path.home()/'Library/Application Support/TraderProvisioning/primary-phone.json';seed.chmod(0o600)
try:
 subprocess.run([str(tools/'native/scripts/phone-install'),'--device',device,str(app)],check=True)
 subprocess.run(['xcrun','devicectl','device','copy','to','--device',device,'--domain-type','appDataContainer','--domain-identifier',{BUNDLE!r},'--source',str(seed),'--destination','Documents/TraderPairing.json'],check=True)
 subprocess.run(['xcrun','devicectl','device','process','launch','--device',device,'--terminate-existing',{BUNDLE!r}],check=True)
 subprocess.run(['/usr/bin/python3',str(tools/'renewal/scripts/deliver.py'),'installed','--repo','trader','--app','trader','--bundle',{BUNDLE!r}],check=True)
 loaded=subprocess.run(['launchctl','print','gui/'+str(os.getuid())+'/com.visar.renewal.trader'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 if loaded.returncode:subprocess.run(['/usr/bin/python3',str(tools/'renewal/scripts/refresh-installed.py'),'install','--repo','trader'],check=True)
 else:print('Existing Trader monthly renewal scheduler retained.')
finally:seed.unlink(missing_ok=True)
''')

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['sync','simulator','build','install','all']);a=p.parse_args()
 if a.action=='sync':sync()
 elif a.action=='simulator':build(True)
 elif a.action=='build':build()
 elif a.action=='install':install()
 else:build();install()
