const fs=require('node:fs/promises');
const path=require('node:path');
const {localPath}=require('./files.cjs');
async function preview(value,{thumbnail,pdfURL}={}){
  const file=localPath(value),stat=await fs.stat(file);
  const result={path:file,name:path.basename(file),directory:stat.isDirectory(),size:stat.size,modified:stat.mtimeMs,created:stat.birthtimeMs,accessed:stat.atimeMs,kind:'unsupported'};
  if(stat.isDirectory())return {...result,kind:'folder'};
  const ext=path.extname(file).toLowerCase();
  if(stat.size>40*1024*1024)return {...result,message:'40 MB를 초과하는 파일은 미리보기를 제공하지 않습니다.'};
  if(/\.(png|jpe?g|webp|bmp|gif|avif)$/.test(ext)&&thumbnail){const image=await thumbnail(file);return {...result,kind:'image',...image};}
  if(ext==='.pdf'&&pdfURL)return {...result,kind:'pdf',url:pdfURL(file)};
  if(/\.(txt|md|csv|json|js|cjs|ts|tsx|jsx|html|css|xml|yml|yaml|log|ini|toml|py|rs|cs|cpp|c|h|sql|ps1|bat|sh)$/.test(ext)){
    const handle=await fs.open(file,'r');let buffer;
    try{buffer=Buffer.alloc(Math.min(stat.size,128*1024));const {bytesRead}=await handle.read(buffer,0,buffer.length,0);buffer=buffer.subarray(0,bytesRead);}finally{await handle.close();}
    const text=buffer[0]===0xff&&buffer[1]===0xfe?buffer.subarray(2).toString('utf16le'):buffer.toString('utf8');
    return {...result,kind:'text',text,truncated:stat.size>buffer.length};
  }
  return {...result,message:'이 파일 형식은 미리보기를 지원하지 않습니다.'};
}
module.exports={preview};
