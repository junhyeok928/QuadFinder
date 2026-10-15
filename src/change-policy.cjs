(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ChangePolicy=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const key=value=>String(value).replace(/\//g,'\\').replace(/\\+$/,'').toLowerCase();
  function affects(folder,paths){
    if(!Array.isArray(paths))return true;
    const target=key(folder);
    return paths.some(value=>{const changed=key(value),parent=changed.slice(0,changed.lastIndexOf('\\'));return changed===target||parent===target||target.startsWith(changed+'\\');});
  }
  function sameEntries(previous,next,accessed=false){
    if(previous.length!==next.length)return false;
    const map=new Map(previous.map(entry=>[key(entry.path),entry]));
    const fields=['name','path','directory','link','size','modified','created','extension','hidden','system','readOnly',...(accessed?['accessed']:[])];
    return next.every(entry=>{const old=map.get(key(entry.path));return old&&fields.every(field=>old[field]===entry[field]);});
  }
  return {key,affects,sameEntries};
});
