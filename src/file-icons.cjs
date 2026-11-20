const path=require('node:path');
const individual=new Set(['.exe','.dll','.ico','.lnk','.url','.cpl','.scr','.msc']);
class FileIcons {
  constructor(read,{limit=256,ttl=60000,concurrency=4,now=Date.now}={}){Object.assign(this,{read,limit,ttl,concurrency,now});this.cache=new Map();this.pending=new Map();this.queue=[];this.active=0;}
  key(file){const ext=path.extname(file).toLowerCase();return ext&&!individual.has(ext)?ext:file.toLowerCase();}
  get(file){
    const key=this.key(file),cached=this.cache.get(key);
    if(cached&&cached.expires>this.now())return Promise.resolve(cached.value);
    if(this.pending.has(key))return this.pending.get(key);
    const result=new Promise(resolve=>this.queue.push({key,file,resolve}));this.pending.set(key,result);this.pump();return result;
  }
  pump(){
    while(this.active<this.concurrency&&this.queue.length){
      const {key,file,resolve}=this.queue.shift();this.active++;
      Promise.resolve().then(()=>this.read(file)).catch(()=>null).then(value=>{
        if(typeof value!=='string'||!/^data:image\/png;base64,/.test(value))value=null;
        if(value){this.cache.delete(key);if(this.cache.size>=this.limit)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,{value,expires:this.now()+this.ttl});}
        this.pending.delete(key);resolve(value);
      }).finally(()=>{this.active--;this.pump();});
    }
  }
}
module.exports={FileIcons};
