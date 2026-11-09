const {compileMatcher}=require('./files.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function indexedQuery(query){
  const words=(query.normalize('NFC').toLocaleLowerCase().match(/(?:[^\s"]+|"[^"]*")+/g)||[]).map(word=>word.replace(/"/g,''));
  return words.some(word=>!['path:','size:','ext:'].some(prefix=>word.startsWith(prefix))&&word.split(/[?*]/).some(part=>[...part].length>=3&&!part.includes('\0')));
}

// Keep only normalized names in RAM. Full records stay on disk and are read
// only after the cheap name predicate accepts a candidate.
class NameSearch {
  constructor(db){
    this.db=db;this.names=new Map();this.ready=false;this.loading=null;
    this.lookup=db.prepare('SELECT e.record FROM search_names n JOIN entries e ON e.id=n.id WHERE n.rowid=?');
    this.identity=db.prepare('SELECT rowid,name FROM search_names WHERE id=?');
  }
  prepare(onProgress=()=>{}){
    if(this.ready)return Promise.resolve();
    if(this.loading)return this.loading;
    this.preparing=true;
    this.loading=(async()=>{
      const page=this.db.prepare('SELECT rowid,name FROM search_names WHERE rowid>? ORDER BY rowid LIMIT 4096');
      let after=0;
      for(;;){
        const rows=page.all(after);if(!rows.length)break;
        for(const row of rows)this.names.set(row.rowid,row.name);
        after=rows.at(-1).rowid;onProgress(this.names.size);await tick();
      }
      this.ready=true;
    })().catch(error=>{this.loading=null;this.preparing=false;throw error;});
    return this.loading;
  }
  update(id){if(!this.preparing&&!this.ready)return;const row=this.identity.get(id);if(row)this.names.set(row.rowid,row.name);}
  remove(id){if(!this.preparing&&!this.ready)return;const row=this.identity.get(id);if(row)this.names.delete(row.rowid);}
  *candidates(query,filter='all'){
    const words=(query.normalize('NFC').toLocaleLowerCase().match(/(?:[^\s"]+|"[^"]*")+/g)||[]);
    const nameQuery=words.filter(word=>!['path:','size:'].some(prefix=>word.replace(/"/g,'').startsWith(prefix))).join(' ');
    const accepts=compileMatcher(nameQuery,filter==='recent'?'all':filter,true);
    const literals=words.map(word=>word.replace(/"/g,'')).filter(word=>!['path:','size:'].some(prefix=>word.startsWith(prefix)));
    const plain=(filter==='all'||filter==='recent')&&literals.every(word=>!word.startsWith('ext:')&&!/[?*]/.test(word));
    // Reuse the probe rather than allocating a million temporary objects.
    const probe={name:'',directory:false};let scanned=0;
    for(const [rowid,name] of this.names){
      probe.name=name;
      let accepted=true;
      if(plain){for(const word of literals)if(!name.includes(word)){accepted=false;break;}}
      else accepted=accepts(probe);
      if(accepted){
        const row=this.lookup.get(rowid);if(row)yield JSON.parse(row.record);
      }
      // Yield even when nothing matches, so obsolete requests can be cancelled.
      if(++scanned%2048===0)yield null;
    }
  }
}
module.exports={NameSearch,indexedQuery};
