// Shared normalization keeps persisted settings and renderer input bounded.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ViewOptions=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const modes={extra:'아주 큰 아이콘',tiles:'큰 아이콘',medium:'보통 아이콘',icons:'작은 아이콘',list:'목록',details:'자세히',tile:'타일',content:'콘텐츠'};
  const fields={name:'이름',modified:'수정한 날짜',size:'크기',type:'유형',created:'만든 날짜',accessed:'액세스한 날짜',parent:'폴더 경로',extension:'확장명'};
  function normalize(value={}){
    const columns=(Array.isArray(value.columns)?value.columns:[]).filter(item=>item&&Object.hasOwn(fields,item.id));
    const unique=[...new Map(columns.map(item=>[item.id,{id:item.id,width:Math.max(65,Math.min(800,Number(item.width)||150))}])).values()];
    if(!unique.some(item=>item.id==='name'))unique.unshift({id:'name',width:240});
    if(!columns.length)unique.push({id:'modified',width:148},{id:'size',width:83},{id:'type',width:150});
    return {view:Object.hasOwn(modes,value.view)?value.view:'details',showHidden:value.showHidden===true,showExtensions:value.showExtensions!==false,checkboxes:value.checkboxes===true,sort:Object.hasOwn(fields,value.sort)||value.sort==='none'?value.sort:'name',desc:value.desc===true,group:['none','type','modified','size'].includes(value.group)?value.group:'none',inspector:['off','preview','details'].includes(value.inspector)?value.inspector:'off',columns:unique};
  }
  function displayName(entry,options){return options.showExtensions||entry.directory?entry.name:entry.name.replace(/\.[^.]+$/,'')||entry.name;}
  function groupKey(entry,group,now=Date.now()){
    if(group==='type')return entry.directory?'폴더':(entry.extension||'확장명 없음').toUpperCase();
    if(group==='size')return entry.directory?'폴더':entry.size<1024**2?'작음 (1 MB 미만)':entry.size<100*1024**2?'보통 (1–100 MB)':'큼 (100 MB 이상)';
    if(group==='modified'){const date=new Date(now);date.setHours(0,0,0,0);const age=date.getTime()-entry.modified;return age<0?'오늘':age<86400000?'어제':age<7*86400000?'최근 7일':age<30*86400000?'최근 30일':'이전';}
    return '';
  }
  const names=new Intl.Collator('ko',{numeric:true}),text=new Intl.Collator('ko');
  function sortedEntries(source,options,typeLabel){
    const entries=source.filter(entry=>options.showHidden||!entry.hidden),sort=options.sort;
    const values=new Map(),groups=new Map(),now=Date.now();
    for(const entry of entries){
      if(sort==='type')values.set(entry,typeLabel(entry));
      if(options.group!=='none')groups.set(entry,groupKey(entry,options.group,now));
    }
    if(sort!=='none')entries.sort((a,b)=>{
      const folders=Number(b.directory)-Number(a.directory);if(folders)return folders;
      let result=sort==='name'?names.compare(a.name,b.name):sort==='type'?text.compare(values.get(a),values.get(b)):['parent','extension'].includes(sort)?text.compare(String(a[sort]||''),String(b[sort]||'')):(a[sort]||0)-(b[sort]||0);
      return result*(options.desc?-1:1)||names.compare(a.name,b.name);
    });
    if(options.group!=='none')entries.sort((a,b)=>text.compare(groups.get(a),groups.get(b)));
    return entries;
  }
  return {modes,fields,normalize,displayName,groupKey,sortedEntries};
});
