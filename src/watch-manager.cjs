const {watch}=require('node:fs');
const path=require('node:path');
const key=value=>path.resolve(value).toLowerCase();
// Retain healthy watches and retry only failed paths. Removed roots never resurrect.
class WatchManager{
  constructor({recursive=false,onChange=()=>{},onStatus=()=>{},onRecovered=()=>{},createWatch=watch,setTimer=setTimeout,clearTimer=clearTimeout}={}){
    Object.assign(this,{recursive,onChange,onStatus,onRecovered,createWatch,setTimer,clearTimer});this.entries=new Map();
  }
  snapshot(){return [...this.entries.values()].filter(entry=>entry.error).map(entry=>({path:entry.path,code:entry.error.code||'EIO',retryMs:entry.delay}));}
  setPaths(paths){
    const wanted=new Map(paths.map(value=>[key(value),value]));
    let removed=false;
    for(const [id,entry]of this.entries)if(!wanted.has(id)){this.entries.delete(id);this.dispose(entry);removed=true;}
    for(const [id,value]of wanted)if(!this.entries.has(id)){const entry={path:value,delay:1000};this.entries.set(id,entry);this.connect(entry);}
    if(removed)this.onStatus();
  }
  current(entry){return this.entries.get(key(entry.path))===entry;}
  connect(entry){
    if(!this.current(entry))return;
    entry.timer=null;const recovering=!!entry.error;
    let watcher;
    try{
      watcher=this.createWatch(entry.path,{recursive:this.recursive,persistent:false},(_event,name)=>{
        if(this.current(entry)&&entry.watcher===watcher)this.onChange(entry.path,name?path.resolve(entry.path,String(name)):entry.path);
      });
      entry.watcher=watcher;
      const failed=error=>{if(this.current(entry)&&entry.watcher===watcher)this.fail(entry,error);};
      watcher.on('error',failed);watcher.on('close',()=>failed(Object.assign(new Error('File watcher closed'),{code:'ECLOSED'})));
    }catch(error){this.fail(entry,error);return;}
    entry.error=null;entry.delay=1000;this.onStatus();
    if(recovering)this.onRecovered(entry.path);
  }
  fail(entry,error){
    if(!this.current(entry)||entry.timer)return;
    const watcher=entry.watcher;entry.watcher=null;watcher?.close();entry.error=error;
    const delay=entry.delay;entry.timer=this.setTimer(()=>{entry.delay=Math.min(delay*2,60000);this.connect(entry);},delay);entry.timer?.unref?.();
    this.onStatus();
  }
  dispose(entry){this.clearTimer(entry.timer);entry.timer=null;const watcher=entry.watcher;entry.watcher=null;watcher?.close();}
  close(){const entries=[...this.entries.values()];this.entries.clear();for(const entry of entries)this.dispose(entry);}
}
module.exports={WatchManager};
