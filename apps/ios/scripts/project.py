#!/usr/bin/env python3
"""Generate the native UIKit Trader Xcode project without private build inputs."""
import hashlib,json,os,plistlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
generated=root/'build';project=generated/'Trader.xcodeproj';project.mkdir(parents=True,exist_ok=True)
objects={}
def ident(name):return hashlib.sha256(name.encode()).hexdigest()[:24].upper()
def obj(label,isa,**fields):
 key=ident(label);objects[key]=dict(isa=isa,**fields);return key
def configs(name,settings):
 return obj(name+'configs','XCConfigurationList',buildConfigurations=[obj(name+c,'XCBuildConfiguration',buildSettings=settings,name=c) for c in ['Debug','Release']],defaultConfigurationIsVisible=0,defaultConfigurationName='Release')
files=[]
def phase(kind,paths):
 refs=[]
 for path in paths:
  kindtype='sourcecode.swift' if path.endswith('.swift') else 'folder.assetcatalog'
  ref=obj(path,'PBXFileReference',lastKnownFileType=kindtype,path=str(root/path),sourceTree='<absolute>');files.append(ref)
  refs.append(obj(kind+path,'PBXBuildFile',fileRef=ref))
 return obj(kind,'PBX'+kind+'BuildPhase',buildActionMask=2147483647,files=refs,runOnlyForDeploymentPostprocessing=0)
kit=obj('Kit','XCLocalSwiftPackageReference',relativePath='../Kit')
products=[obj('Kit'+name,'XCSwiftPackageProductDependency',productName=name) for name in ['KitCore','KitNet','KitLists','KitNavigation','KitLifecycle','KitTestHooks']]
frameworks=obj('Frameworks','PBXFrameworksBuildPhase',buildActionMask=2147483647,files=[obj('Link'+p,'PBXBuildFile',productRef=p) for p in products],runOnlyForDeploymentPostprocessing=0)
phases=[phase('Sources',[str(p.relative_to(root)) for p in sorted((root/'TraderApp').glob('*.swift'))]),phase('Resources',['Resources/Assets.xcassets']),frameworks]
product=obj('Product','PBXFileReference',explicitFileType='wrapper.application',includeInIndex=0,path='Trader.app',sourceTree='BUILT_PRODUCTS_DIR')
settings=dict(CODE_SIGN_STYLE='Automatic',CURRENT_PROJECT_VERSION='1',MARKETING_VERSION='1.0',GENERATE_INFOPLIST_FILE='NO',PRODUCT_NAME='Trader',TARGETED_DEVICE_FAMILY='1',SWIFT_VERSION='6.0',SWIFT_STRICT_CONCURRENCY='complete',IPHONEOS_DEPLOYMENT_TARGET='26.0',CLANG_ENABLE_MODULES='YES',SDKROOT='iphoneos',SUPPORTED_PLATFORMS='iphoneos iphonesimulator',INFOPLIST_FILE=str(generated/'Info.plist'),PRODUCT_BUNDLE_IDENTIFIER='com.visar.Trader.paid',ASSETCATALOG_COMPILER_APPICON_NAME='AppIcon',ENABLE_USER_SCRIPT_SANDBOXING='YES')
target=obj('Target','PBXNativeTarget',buildConfigurationList=configs('Trader',settings),buildPhases=phases,buildRules=[],dependencies=[],name='Trader',productName='Trader',productReference=product,productType='com.apple.product-type.application',packageProductDependencies=products)
group=obj('Main','PBXGroup',children=files+[product],sourceTree='<group>')
proj=obj('Project','PBXProject',buildConfigurationList=configs('Project',{}),compatibilityVersion='Xcode 14.0',developmentRegion='en',knownRegions=['en','Base'],mainGroup=group,productRefGroup=group,projectDirPath='',projectRoot='',targets=[target],packageReferences=[kit])
def encode(v):
 if isinstance(v,dict):return '{'+''.join(json.dumps(k)+' = '+encode(x)+';\n' for k,x in v.items())+'}'
 if isinstance(v,list):return '('+','.join(encode(x) for x in v)+')'
 return json.dumps(v)
(project/'project.pbxproj').write_text('// !$*UTF8*$!\n'+encode(dict(archiveVersion=1,classes={},objectVersion=60,objects=objects,rootObject=proj)))
info=dict(CFBundleDevelopmentRegion='en',CFBundleExecutable='$(EXECUTABLE_NAME)',CFBundleIdentifier='$(PRODUCT_BUNDLE_IDENTIFIER)',CFBundleInfoDictionaryVersion='6.0',CFBundleName='Trader',CFBundleDisplayName='Trader',CFBundleShortVersionString='$(MARKETING_VERSION)',CFBundleVersion='$(CURRENT_PROJECT_VERSION)',CFBundlePackageType='APPL',LSRequiresIPhoneOS=True,UILaunchScreen={},UIRequiredDeviceCapabilities=['arm64'],UIApplicationSceneManifest={'UIApplicationSupportsMultipleScenes':False},UISupportedInterfaceOrientations=['UIInterfaceOrientationPortrait','UIInterfaceOrientationLandscapeLeft','UIInterfaceOrientationLandscapeRight'])
fingerprint=hashlib.sha256()
for path in sorted([*(root/'TraderApp').glob('*.swift'),*(root/'Resources').rglob('*'),*(root/'Kit/Sources').rglob('*.swift'),root/'Kit/Package.swift',root/'scripts/build.py',root/'scripts/project.py']):
 if path.is_file():fingerprint.update(str(path.relative_to(root)).encode());fingerprint.update(path.read_bytes())
info['TraderSourceRevision']=fingerprint.hexdigest()[:16]
(generated/'Info.plist').write_bytes(plistlib.dumps(info))
scheme=project/'xcshareddata/xcschemes';scheme.mkdir(parents=True,exist_ok=True)
(scheme/'Trader.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?><Scheme LastUpgradeVersion="2630" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForRunning="YES" buildForTesting="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="Trader.app" BlueprintName="Trader" ReferencedContainer="container:Trader.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction><LaunchAction buildConfiguration="Release" useCustomWorkingDirectory="NO" launchStyle="0" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="Trader.app" BlueprintName="Trader" ReferencedContainer="container:Trader.xcodeproj"/></BuildableProductRunnable></LaunchAction></Scheme>''')
