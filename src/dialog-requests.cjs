const {randomUUID}=require('node:crypto');
class DialogRequests{
 constructor(send){this.send=send;this.pending=new Map();}
 ask(options,signal){
  if(signal?.aborted)return Promise.resolve({action:'cancel',applyAll:false});
  if(options.key)for(const item of this.pending.values())if(item.options.key===options.key)return item.promise;
  const id=randomUUID();let resolve;const promise=new Promise(done=>resolve=done);
  const item={options,promise,resolve,signal};item.abort=()=>this.finish(id,{action:'cancel'},true);this.pending.set(id,item);signal?.addEventListener('abort',item.abort,{once:true});
  this.send('dialog:request',{...options,id});return promise;
 }
 finish(id,input={},notify=false){const item=this.pending.get(id);if(!item)return false;const allowed=item.options.choices.map(choice=>choice.action).concat('cancel');if(!allowed.includes(input.action))throw new Error('허용되지 않은 확인 응답입니다.');this.pending.delete(id);item.signal?.removeEventListener('abort',item.abort);if(notify)this.send('dialog:cancel',id);item.resolve({action:input.action,applyAll:item.options.applyAll===true&&input.applyAll===true});return true;}
 clear(){for(const id of this.pending.keys())this.finish(id,{action:'cancel'},true);}
}
module.exports={DialogRequests};
