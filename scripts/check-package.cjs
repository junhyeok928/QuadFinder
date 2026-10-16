const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
async function check(){
 const asar=require(require.resolve('@electron/asar',{paths:[path.dirname(require.resolve('@electron/packager'))]}));const {version}=require('../package.json');const root=path.resolve('release',version,'QuadFinder-win32-x64'),archive=path.join(root,'resources','app.asar');
 const files=asar.listPackage(archive);assert.ok(files.includes('\\src\\renderer\\marquee.js')||files.includes('/src/renderer/marquee.js'));
 for(const file of files){const relative=file.replaceAll('\\','/').replace(/^\//,'');assert.ok(/^(src(?:\/|$)|assets(?:\/|$)|package\.json$)/.test(relative),'Unnecessary app file: '+relative);if(relative!=='package.json'&&fs.statSync(path.resolve(relative)).isFile())assert.deepEqual(asar.extractFile(archive,path.normalize(relative)),fs.readFileSync(relative),'Stale packaged source: '+relative);}
 const pkg=JSON.parse(asar.extractFile(archive,'package.json'));assert.equal(pkg.version,version);assert.equal(pkg.main,'src/main.cjs');
 assert.deepEqual(fs.readdirSync(path.join(root,'locales')).sort(),['en-US.pak','ko.pak']);
 for(const file of ['QuadFinder.exe','icudtl.dat','resources.pak','LICENSE','LICENSES.chromium.html','resources/QuadFinder.Shell.exe','resources/QuadFinder.Index.exe'])assert.ok(fs.statSync(path.join(root,file)).size>0,file);
 console.log('Portable package verified: current app sources, native helpers, licenses and ko/en-US.');
}
check().catch(error=>{console.error(error);process.exitCode=1;});
