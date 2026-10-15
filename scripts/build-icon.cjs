// Rasterize the SVG in Chromium, then store PNG frames in a Windows ICO.
const {app,BrowserWindow,nativeImage}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
app.whenReady().then(async()=>{
  const assets=path.resolve(__dirname,'../assets');
  const svg=await fs.readFile(path.join(assets,'app-icon.svg'),'utf8');
  const window=new BrowserWindow({width:256,height:256,show:false,transparent:true,frame:false,webPreferences:{sandbox:true}});
  await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<html><body style="margin:0;width:256px;height:256px;background:transparent">${svg}</body></html>`));
  await new Promise(resolve=>setTimeout(resolve,150));
  const source=await window.webContents.capturePage();
  const image=nativeImage.createFromBuffer(source.toPNG());
  await fs.writeFile(path.join(assets,'app-icon.png'),image.resize({width:256,height:256,quality:'best'}).toPNG());
  const sizes=[16,20,24,32,40,48,64,128,256];
  const frames=sizes.map(size=>image.resize({width:size,height:size,quality:'best'}).toPNG());
  const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
  let offset=header.length;
  frames.forEach((png,i)=>{const entry=6+i*16,size=sizes[i];header[entry]=size===256?0:size;header[entry+1]=size===256?0:size;header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);header.writeUInt32LE(png.length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=png.length;});
  await fs.writeFile(path.join(assets,'app-icon.ico'),Buffer.concat([header,...frames]));
  console.log('폴더·문서·검색 아이콘 생성 완료 (16–256px)');app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
