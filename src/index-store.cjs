const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {key}=require('./index-paths.cjs');

// Keep records and parent lookups on disk; only a page of rows is decoded at once.
class IndexStore{
  constructor(file=':memory:'){
    if(file!==':memory:')fs.mkdirSync(path.dirname(file),{recursive:true});
    this.db=new DatabaseSync(file);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-8192;
      CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,parent TEXT NOT NULL,record TEXT NOT NULL,search TEXT) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS entries_parent ON entries(parent);
      CREATE TABLE IF NOT EXISTS metadata(id TEXT PRIMARY KEY,value TEXT NOT NULL) WITHOUT ROWID;`);
    if(!this.db.prepare('PRAGMA table_info(entries)').all().some(column=>column.name==='search'))this.db.exec('ALTER TABLE entries ADD COLUMN search TEXT');
    this.count=Number(this.db.prepare('SELECT COUNT(*) AS n FROM entries').get().n);this.pending=0;
    const get=this.db.prepare('SELECT record FROM entries WHERE id=?'),has=this.db.prepare('SELECT 1 AS n FROM entries WHERE id=?');
    const put=this.db.prepare('INSERT INTO entries(id,parent,record,search) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET parent=excluded.parent,record=excluded.record,search=excluded.search');
    const remove=this.db.prepare('DELETE FROM entries WHERE id=?');
    const self=this;
    this.entries={get size(){return self.count;},get:id=>{const row=get.get(id);return row?JSON.parse(row.record):undefined;},has:id=>!!has.get(id),
      set:(id,entry)=>{const exists=!!has.get(id);self.begin();put.run(id,key(path.dirname(entry.path)),JSON.stringify(entry),entry.name.normalize('NFC').toLocaleLowerCase());if(!exists)self.count++;self.changed();},
      delete:id=>{self.begin();const result=remove.run(id);self.count-=Number(result.changes);self.changed();return !!result.changes;},values:()=>self.values()};
    const children=this.db.prepare('SELECT id FROM entries WHERE parent=?');
    this.children={get:id=>new Set(children.all(id).map(row=>row.id)),has:id=>true,set:()=>{},delete:()=>{}};
  }
  begin(){if(!this.pending)this.db.exec('BEGIN');this.pending++;}
  changed(){if(this.pending>=512)this.flush();}
  flush(){if(this.pending){this.db.exec('COMMIT');this.pending=0;}}
  *values(){let after='';const page=this.db.prepare('SELECT id,record FROM entries WHERE id>? ORDER BY id LIMIT 512');for(;;){const rows=page.all(after);if(!rows.length)return;for(const row of rows)yield JSON.parse(row.record);after=rows.at(-1).id;}}
  *candidates(query){
    const words=(query.normalize('NFC').toLocaleLowerCase().match(/(?:[^\s"]+|"[^"]*")+/g)||[]).map(word=>word.replace(/"/g,''));
    const hints=words.filter(word=>!['ext:','path:','size:'].some(prefix=>word.startsWith(prefix))).map(word=>word.split(/[?*]/).sort((a,b)=>b.length-a.length)[0]).filter(Boolean);
    if(!hints.length){yield* this.values();return;}
    const page=this.db.prepare('SELECT id,record FROM entries WHERE id>? AND (search IS NULL OR ('+hints.map(()=> 'instr(search,?)>0').join(' AND ')+')) ORDER BY id LIMIT 512');
    let after='';for(;;){const rows=page.all(after,...hints);if(!rows.length)return;for(const row of rows)yield JSON.parse(row.record);after=rows.at(-1).id;}
  }
  getMeta(id){const row=this.db.prepare('SELECT value FROM metadata WHERE id=?').get(id);return row?JSON.parse(row.value):undefined;}
  setMeta(id,value){const json=JSON.stringify(value);if(this.db.prepare('SELECT value FROM metadata WHERE id=?').get(id)?.value===json)return;this.begin();this.db.prepare('INSERT INTO metadata VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(id,json);this.changed();}
  close(){this.flush();this.db.close();}
}
module.exports={IndexStore};
