const path=require('node:path');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
function executable(){return process.resourcesPath&&fs.existsSync(path.join(process.resourcesPath,'QuadFinder.Shell.exe'))?path.join(process.resourcesPath,'QuadFinder.Shell.exe'):path.resolve(__dirname,'../output/native/QuadFinder.Shell.exe');}
function request(input){return new Promise((resolve,reject)=>{
  const child=spawn(executable(),[],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',error='';
  const timer=input.mode==='menu'?null:setTimeout(()=>{child.kill();reject(new Error('Windows 셸 응답 시간이 초과되었습니다.'));},15000);
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',data=>{output+=data;if(output.length>20000000)child.kill();});child.stderr.on('data',data=>error+=data);
  child.on('error',value=>{clearTimeout(timer);reject(value);});child.stdin.on('error',()=>{});
  child.on('close',()=>{clearTimeout(timer);try{const result=JSON.parse(output.replace(/^\uFEFF/,''));if(result.ok)resolve(result.value);else reject(new Error(result.error));}catch(value){reject(new Error(error||value.message));}});
  child.stdin.end(JSON.stringify(input));
});}
module.exports={request,executable};
