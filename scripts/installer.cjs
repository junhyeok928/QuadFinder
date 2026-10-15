const path=require('node:path'),fs=require('node:fs/promises'),{createHash}=require('node:crypto'),{createReadStream}=require('node:fs');
async function build(){
 const {version,description}=require('../package.json'),appDirectory=path.resolve(`release/${version}/QuadFinder-win32-x64`),outputDirectory=path.resolve(`release/${version}/installer`);
 await fs.access(path.join(appDirectory,'QuadFinder.exe'));
 await require('electron-winstaller').createWindowsInstaller({appDirectory,outputDirectory,authors:'QuadFinder contributors',owners:'junhyeok928',name:'quadfinder',title:'QuadFinder',exe:'QuadFinder.exe',version,description,noMsi:true,setupExe:`QuadFinder-${version}-win32-x64-Setup.exe`,setupIcon:path.resolve('assets/app-icon.ico'),iconUrl:'https://raw.githubusercontent.com/junhyeok928/QuadFinder/main/assets/app-icon.ico'});
 const sums=[];for(const name of (await fs.readdir(outputDirectory)).filter(name=>/\.(exe|nupkg)$/.test(name)||name==='RELEASES')){const hash=createHash('sha256');for await(const chunk of createReadStream(path.join(outputDirectory,name)))hash.update(chunk);sums.push(`${hash.digest('hex')}  ${name}`);}await fs.writeFile(path.join(outputDirectory,'SHA256SUMS.txt'),sums.join('\n')+'\n');console.log(outputDirectory);
}
build().catch(error=>{console.error(error);process.exitCode=1;});
