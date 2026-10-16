const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
async function wrap({backend,output,testing=false,profileRoot,registryKey}){
 const {version}=require('../package.json'),temporary=path.dirname(backend),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 const source=await fs.readFile(path.resolve('installer/SetupWindow.cs')),view=await fs.readFile(path.resolve('installer/setup-window.xaml')),payloadHash=sha(await fs.readFile(backend));
 const frozenSource=path.join(temporary,'SetupWindow.cs'),frozenView=path.join(temporary,'setup-window.xaml'),config=path.join(temporary,'SetupConfig.cs');await fs.writeFile(frozenSource,source);await fs.writeFile(frozenView,view);
 const directory=testing?path.join(profileRoot,'app'):path.join(process.env.LOCALAPPDATA,'Programs','QuadFinderPreview');
 const value=input=>JSON.stringify(input);
 const defaultExpression=testing?value(directory):'System.IO.Path.Combine(System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData),"Programs","QuadFinderPreview")';
 await fs.writeFile(config,`internal static class SetupConfig { internal const string Version=${value(version)}, RegistryKey=${value(registryKey||'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\QuadFinderPreview')}, PayloadHash=${value(payloadHash)}; internal const bool Testing=${testing?'true':'false'}; internal static string DefaultDirectory {get{return ${defaultExpression};}} }`);
 const framework=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319'),compiler=path.join(framework,'csc.exe');
 const references=['System.Xaml.dll','WindowsBase.dll','PresentationCore.dll','PresentationFramework.dll'].map(file=>file==='System.Xaml.dll'?path.join(framework,file):path.join(framework,'WPF',file));
 const args=['/nologo','/target:winexe','/platform:x64','/optimize+','/r:System.Windows.Forms.dll',...references.map(file=>'/r:'+file),'/out:'+output,'/win32icon:'+path.resolve('assets/app-icon.ico'),'/resource:'+backend+',QuadFinder.SetupPayload','/resource:'+frozenView+',QuadFinder.SetupView','/resource:'+path.resolve('assets/app-icon.png')+',QuadFinder.SetupIcon'];if(testing)args.push('/define:TESTING');args.push(frozenSource,config);execFileSync(compiler,args,{windowsHide:true,stdio:'pipe',timeout:120000});
 return {frontendSha256:sha(source),viewSha256:sha(view),payloadSha256:payloadHash,frontendBuilderSha256:sha(await fs.readFile(__filename))};
}
function extractEngine(setup,destination){
 const literal=value=>"'"+value.replaceAll("'","''")+"'";
 const command=`$assembly=[Reflection.Assembly]::LoadFile(${literal(setup)});$inputStream=$assembly.GetManifestResourceStream('QuadFinder.SetupPayload');if($null -eq $inputStream){throw 'Missing installer engine'};$outputStream=[IO.File]::Create(${literal(destination)});try{$inputStream.CopyTo($outputStream)}finally{$outputStream.Dispose();$inputStream.Dispose()}`;
 execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:'pipe',timeout:30000});
}
module.exports={wrap,extractEngine};
