const path=require('node:path');
const key=value=>path.resolve(value).toLowerCase();
const within=(value,root)=>key(value)===key(root)||key(value).startsWith(key(root)+path.sep);
function indexable(value,roots,excluded=[]){
  return roots.some(root=>within(value,root))&&!excluded.some(root=>within(value,root))&&!path.resolve(value).split(/[\\/]/).some(part=>['node_modules','.git','$recycle.bin','system volume information'].includes(part.toLowerCase())||part.toLowerCase().startsWith('.quadfinder-'));
}
module.exports={key,within,indexable};
