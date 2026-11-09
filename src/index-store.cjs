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
    // A separate rowid table lets FTS update/delete postings without scanning names.
    this.db.exec(`CREATE TABLE IF NOT EXISTS search_names(rowid INTEGER PRIMARY KEY,id TEXT NOT NULL UNIQUE,name TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS names_fts USING fts5(name,content='search_names',content_rowid='rowid',tokenize='trigram case_sensitive 1');
      CREATE TRIGGER IF NOT EXISTS names_insert AFTER INSERT ON search_names BEGIN INSERT INTO names_fts(rowid,name) VALUES(new.rowid,new.name); END;
      CREATE TRIGGER IF NOT EXISTS names_delete AFTER DELETE ON search_names BEGIN INSERT INTO names_fts(names_fts,rowid,name) VALUES('delete',old.rowid,old.name); END;
      CREATE TRIGGER IF NOT EXISTS names_update AFTER UPDATE OF name ON search_names WHEN old.name!=new.name BEGIN
        INSERT INTO names_fts(names_fts,rowid,name) VALUES('delete',old.rowid,old.name);
        INSERT INTO names_fts(rowid,name) VALUES(new.rowid,new.name); END;
      CREATE TRIGGER IF NOT EXISTS entries_search_insert AFTER INSERT ON entries BEGIN
        INSERT INTO search_names(id,name) VALUES(new.id,coalesce(new.search,json_extract(new.record,'$.name'))); END;
      CREATE TRIGGER IF NOT EXISTS entries_search_update AFTER UPDATE ON entries BEGIN
        UPDATE search_names SET name=coalesce(new.search,json_extract(new.record,'$.name')) WHERE id=new.id; END;
      CREATE TRIGGER IF NOT EXISTS entries_search_delete AFTER DELETE ON entries BEGIN DELETE FROM search_names WHERE id=old.id; END;`);
    if(!this.getMeta('namesIndexV1')){
      this.db.exec('BEGIN');
      try{
        const update=this.db.prepare('UPDATE entries SET search=? WHERE id=?');
        for(const row of this.db.prepare('SELECT id,record FROM entries WHERE search IS NULL').all())update.run(JSON.parse(row.record).name.normalize('NFC').toLocaleLowerCase(),row.id);
        this.db.exec("INSERT OR IGNORE INTO search_names(id,name) SELECT id,search FROM entries; INSERT INTO metadata(id,value) VALUES('namesIndexV1','true'); COMMIT");
      }catch(error){this.db.exec('ROLLBACK');throw error;}
    }
    this.count=Number(this.db.prepare('SELECT COUNT(*) AS n FROM search_names').get().n);this.pending=0;this.lastCommit=Date.now();
    this.nameSearch=new (require('./name-search.cjs').NameSearch)(this.db);
    const get=this.db.prepare('SELECT record FROM entries WHERE id=?'),has=this.db.prepare('SELECT 1 AS n FROM entries WHERE id=?');
    const put=this.db.prepare('INSERT INTO entries(id,parent,record,search) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET parent=excluded.parent,record=excluded.record,search=excluded.search');
    const remove=this.db.prepare('DELETE FROM entries WHERE id=?');
    const self=this;
    this.entries={get size(){return self.count;},get:id=>{const row=get.get(id);return row?JSON.parse(row.record):undefined;},has:id=>!!has.get(id),
      set:(id,entry,exists=!!has.get(id))=>{self.begin();put.run(id,key(path.dirname(entry.path)),JSON.stringify(entry),entry.name.normalize('NFC').toLocaleLowerCase());if(!exists)self.count++;self.nameSearch.update(id);self.changed();},
      delete:id=>{self.nameSearch.remove(id);self.begin();const result=remove.run(id);self.count-=Number(result.changes);self.changed();return !!result.changes;},values:()=>self.values()};
    const children=this.db.prepare('SELECT id FROM entries WHERE parent=?');
    this.children={get:id=>new Set(children.all(id).map(row=>row.id)),has:id=>true,set:()=>{},delete:()=>{}};
  }
  begin(){if(!this.pending)this.db.exec('BEGIN');this.pending++;}
  changed(){if(this.pending>=4096)this.flush();}
  flushIfDue(){if(Date.now()-this.lastCommit>=250)this.flush();}
  flush(){if(this.pending){this.db.exec('COMMIT');this.pending=0;this.lastCommit=Date.now();}}
  *values(){let after='';const page=this.db.prepare('SELECT id,record FROM entries WHERE id>? ORDER BY id LIMIT 512');for(;;){const rows=page.all(after);if(!rows.length)return;for(const row of rows)yield JSON.parse(row.record);after=rows.at(-1).id;}}
  *candidates(query){
    const words=(query.normalize('NFC').toLocaleLowerCase().match(/(?:[^\s"]+|"[^"]*")+/g)||[]).map(word=>word.replace(/"/g,''));
    const hints=words.filter(word=>!['ext:','path:','size:'].some(prefix=>word.startsWith(prefix))).map(word=>word.split(/[?*]/).sort((a,b)=>b.length-a.length)[0]).filter(Boolean);
    if(!hints.length){yield* this.values();return;}
    const indexed=hints.filter(hint=>[...hint].length>=3&&!hint.includes('\0'));
    if(indexed.length){
      const match=indexed.map(hint=>'"'+hint.replace(/"/g,'""')+'"').join(' AND ');
      const statement=this.db.prepare('SELECT n.rowid,e.record FROM names_fts JOIN search_names n ON n.rowid=names_fts.rowid JOIN entries e ON e.id=n.id WHERE names_fts MATCH ? AND names_fts.rowid>? ORDER BY names_fts.rowid LIMIT 512');
      let after=0;for(;;){const rows=statement.all(match,after);if(!rows.length)break;for(const row of rows)yield JSON.parse(row.record);after=rows.at(-1).rowid;}
      return;
    }
    const page=this.db.prepare('SELECT id,record FROM entries WHERE id>? AND (search IS NULL OR ('+hints.map(()=> 'instr(search,?)>0').join(' AND ')+')) ORDER BY id LIMIT 512');
    let after='';for(;;){const rows=page.all(after,...hints);if(!rows.length)return;for(const row of rows)yield JSON.parse(row.record);after=rows.at(-1).id;}
  }

  *paths(){const page=this.db.prepare('SELECT rowid,id FROM search_names WHERE rowid>? ORDER BY rowid LIMIT 512');let after=0;for(;;){const rows=page.all(after);if(!rows.length)return;for(const row of rows)yield row.id;after=rows.at(-1).rowid;}}
  getMeta(id){const row=this.db.prepare('SELECT value FROM metadata WHERE id=?').get(id);return row?JSON.parse(row.value):undefined;}
  setMeta(id,value){const json=JSON.stringify(value);if(this.db.prepare('SELECT value FROM metadata WHERE id=?').get(id)?.value===json)return;this.begin();this.db.prepare('INSERT INTO metadata VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(id,json);this.changed();}
  close(){this.flush();this.db.close();}
}
module.exports={IndexStore};
