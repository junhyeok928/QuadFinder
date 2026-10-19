const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {AppUpdater}=require('../src/updater.cjs');
function native(){const api=new EventEmitter();api.checks=0;api.installs=0;api.setFeedURL=value=>api.feed=value.url;api.checkForUpdates=()=>api.checks++;api.quitAndInstall=()=>api.installs++;return api;}
test('portable builds never contact the automatic update service',()=>{const api=native(),updater=new AppUpdater({native:api,version:'0.8.0'});assert.equal(updater.check().phase,'portable');updater.start();assert.equal(api.checks,0);assert.equal(api.feed,undefined);assert.throws(()=>updater.install(),/다운로드/);updater.stop();});
test('installed updater prevents duplicate checks and installs only when ready and idle',()=>{const api=native();let idle=false;const updater=new AppUpdater({native:api,version:'0.8.0',installed:true,canInstall:()=>idle});assert.equal(api.feed,'https://update.electronjs.org/junhyeok928/QuadFinder/win32-x64/0.8.0');updater.check();updater.check();assert.equal(api.checks,1);api.emit('update-available');assert.equal(updater.snapshot().phase,'downloading');api.emit('update-downloaded',null,'notes','0.9.0');assert.equal(updater.snapshot().phase,'ready');assert.equal(api.installs,0);assert.throws(()=>updater.install(),/파일 작업/);idle=true;updater.install();assert.equal(api.installs,1);});
test('failed update checks can retry and no update is a successful terminal state',()=>{const api=native(),updater=new AppUpdater({native:api,version:'0.8.0',installed:true});updater.check();api.emit('error',new Error('offline'));assert.equal(updater.snapshot().phase,'error');updater.check();assert.equal(api.checks,2);api.emit('update-not-available');assert.equal(updater.snapshot().phase,'current');assert.equal(updater.checking,false);});


test('preview wizard installations disable all automatic update network requests',()=>{const api=native(),updater=new AppUpdater({native:api,version:'0.10.0',installed:true,preview:true});assert.equal(updater.check().phase,'preview');updater.start();assert.equal(api.checks,0);assert.equal(api.feed,undefined);updater.stop();});

test('NSIS beta installers use manual releases without contacting Squirrel feeds',()=>{const api=native(),updater=new AppUpdater({native:api,version:'0.14.0-beta.1',installed:true,manual:true});assert.equal(updater.check().phase,'manual');updater.start();assert.equal(api.checks,0);assert.equal(api.feed,undefined);updater.stop();});

const {newestRelease}=require('../src/release-check.cjs');
const release=(tag_name,extra={})=>({tag_name,draft:false,prerelease:tag_name.includes('-'),...extra});
test('release notifications compare numeric versions, beta identifiers and release channels',()=>{
 const releases=['v0.14.0-beta.3','v0.14.0-beta.10','v0.14.0-beta.9','bad-tag'].map(tag=>release(tag));
 assert.equal(newestRelease(releases,'0.14.0-beta.4'),'v0.14.0-beta.10');
 assert.equal(newestRelease([...releases,release('v0.14.0')],'0.14.0-beta.4'),'v0.14.0');
 assert.equal(newestRelease([release('v0.15.0-beta.1'),release('v0.14.1'),release('v9.0.0',{draft:true})],'0.14.0'),'v0.14.1');
 assert.equal(newestRelease([release('v0.14.0+build.3'),release('v0.13.9')],'0.14.0'),null);
 assert.equal(newestRelease([release('v0.9.0'),release('v0.10.0')],'0.8.0'),'v0.10.0');
 assert.throws(()=>newestRelease({},'0.14.0'));
});
test('manual and portable notifications use release metadata without native downloads',async()=>{
 for(const manual of [false,true]){
  const api=native();const updater=new AppUpdater({native:api,version:'0.14.0-beta.4',manual,installed:manual,notifyReleases:true,loadReleases:async()=>[release('v0.14.0-beta.5')]});
  const result=await updater.check();assert.equal(result.available,true);assert.equal(result.latestVersion,'v0.14.0-beta.5');assert.equal(result.manualDownload,true);
  assert.equal(api.checks,0);assert.equal(api.feed,undefined);assert.throws(()=>updater.install());updater.stop();
 }
});
test('notification checks coalesce and preserve known updates on a temporary network failure',async()=>{
 let finish,calls=0;
 const updater=new AppUpdater({native:native(),version:'0.14.0',notifyReleases:true,loadReleases:()=>{calls++;return new Promise(resolve=>finish=resolve);}});
 const first=updater.check();assert.equal((await updater.check()).phase,'checking');assert.equal(calls,1);
 finish([release('v0.14.1')]);assert.equal((await first).available,true);
 updater.loadReleases=async()=>{throw new Error('offline');};assert.equal((await updater.check()).available,true);
 updater.loadReleases=async()=>[];assert.equal((await updater.check()).available,false);updater.stop();
});
test('failed initial checks do not create a dot and preview mode never requests releases',async()=>{
 let calls=0;const loadReleases=async()=>{calls++;throw new Error('offline');};
 const updater=new AppUpdater({native:native(),version:'0.14.0',notifyReleases:true,loadReleases});assert.equal((await updater.check()).available,false);updater.stop();
 const preview=new AppUpdater({native:native(),version:'0.14.0',preview:true,manual:true,notifyReleases:true,loadReleases});preview.start();assert.equal((await preview.check()).phase,'preview');assert.equal(calls,1);preview.stop();
});
test('stopping the updater aborts in-flight metadata requests without publishing an error',async()=>{
 let signal;const updater=new AppUpdater({native:native(),version:'0.14.0',notifyReleases:true,loadReleases:options=>{signal=options.signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));}});
 const pending=updater.check();updater.stop();await pending;assert.equal(signal.aborted,true);assert.equal(updater.checking,false);assert.equal(updater.snapshot().available,false);
});
test('update button shows an accessible dot only for known newer versions',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const source=fs.readFileSync(require.resolve('../src/renderer/features.js'),'utf8');
 const start=source.indexOf('  const updateUpdater=value=>{'),end=source.indexOf(';updateUpdater(updateState);',start);
 const button={classList:{toggle(name,value){button.dot=value;}},setAttribute(name,value){button[name]=value;}};
 const render=vm.runInNewContext(source.slice(start,end)+';updateUpdater',{$:()=>button,updateState:null});
 for(const phase of ['portable','manual','current','error']){render({phase});assert.equal(button.dot,false);}
 render({phase:'available',available:true,latestVersion:'v0.14.1'});assert.equal(button.dot,true);assert.equal(button.disabled,false);assert.match(button['aria-label'],/새 버전 있음.*v0.14.1/);
 render({phase:'error',available:true});assert.equal(button.dot,true);
 render({phase:'current',available:false});assert.equal(button.dot,false);
 for(const phase of ['downloading','ready']){render({phase});assert.equal(button.dot,true);}
});
