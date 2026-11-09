const path=require('node:path');
const key=value=>path.resolve(value).toLowerCase();
const within=(value,root)=>key(value)===key(root)||key(value).startsWith(key(root).replace(/[\\/]$/,'')+path.sep);
const networkPath=(value,networkDrives=[])=>/^[\\/]{2}/.test(value)||networkDrives.some(root=>within(value,root));
function indexable(value,roots,excluded=[]){
  return !networkPath(value)&&roots.some(root=>within(value,root))&&!excluded.some(root=>within(value,root))&&!path.resolve(value).split(/[\\/]/).some(part=>['$recycle.bin','system volume information'].includes(part.toLowerCase())||part.toLowerCase().startsWith('.quadfinder-'));
}
function createScope(roots,excluded=[]){
  const scopes=roots.map(key),blocks=excluded.map(key),inside=(id,root)=>id===root||id.startsWith(root.replace(/[\\/]$/,'')+path.sep);
  return value=>{if(typeof value!=='string'||/^[\\/]{2}/.test(value))return false;const id=key(value);return scopes.some(root=>inside(id,root))&&!blocks.some(root=>inside(id,root))&&!id.split(/[\\/]/).some(part=>['$recycle.bin','system volume information'].includes(part)||part.startsWith('.quadfinder-'));};
}
module.exports={key,within,indexable,networkPath,createScope};
