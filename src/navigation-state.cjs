(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.NavigationState=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const key=value=>String(value).replace(/\//g,'\\').replace(/\\+$/,'').toLowerCase();
  function normalize(value={}){
    if(!value||typeof value!=='object')value={};
    const paths=(values,limit)=>Array.isArray(values)?[...new Map(values.filter(value=>typeof value==='string'&&value.length<32768).map(value=>[key(value),value])).values()].slice(-limit):[];
    const labels=Object.fromEntries(Object.entries(value.labels||{}).filter(([path,label])=>path.length<32768&&typeof label==='string'&&label.trim()).slice(-256).map(([path,label])=>[key(path),label.trim().slice(0,80)]));
    const recent=Array.isArray(value.recent)?[...new Map(value.recent.filter(path=>typeof path==='string'&&path.length>0&&path.length<32768&&!/[\x00-\x1f]/.test(path)).map(path=>[key(path),path])).values()].slice(0,10):[];
    return {collapsed:{favorites:value.collapsed?.favorites===true,pc:value.collapsed?.pc===true,recent:value.collapsed?.recent===true},favorites:paths(value.favorites,256),hidden:paths(value.hidden,256),order:paths(value.order,512),expanded:paths(value.expanded,64),recent,labels};
  }
  function visit(value,path){const next=normalize(value);if(typeof path!=='string'||!path||path.length>=32768||/[\x00-\x1f]/.test(path))return next;next.recent=[path,...next.recent.filter(item=>key(item)!==key(path))].slice(0,10);return next;}
  return {key,normalize,visit};
});
