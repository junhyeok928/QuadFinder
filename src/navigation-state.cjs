(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.NavigationState=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const key=value=>String(value).replace(/\//g,'\\').replace(/\\+$/,'').toLowerCase();
  function normalize(value={}){
    if(!value||typeof value!=='object')value={};
    const paths=(values,limit)=>Array.isArray(values)?[...new Map(values.filter(value=>typeof value==='string'&&value.length<32768).map(value=>[key(value),value])).values()].slice(-limit):[];
    const labels=Object.fromEntries(Object.entries(value.labels||{}).filter(([path,label])=>path.length<32768&&typeof label==='string'&&label.trim()).slice(-256).map(([path,label])=>[key(path),label.trim().slice(0,80)]));
    return {collapsed:{favorites:value.collapsed?.favorites===true,pc:value.collapsed?.pc===true},favorites:paths(value.favorites,256),hidden:paths(value.hidden,256),order:paths(value.order,512),expanded:paths(value.expanded,64),labels};
  }
  return {key,normalize};
});
