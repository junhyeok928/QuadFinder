const API='https://api.github.com/repos/junhyeok928/QuadFinder/releases?per_page=100';
function versionParts(value){
  const match=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value||'');
  if(!match)return null;
  const pre=match[4]?.split('.')||[];
  if(pre.some(value=>/^\d+$/.test(value)&&value.length>1&&value[0]==='0'))return null;
  return {core:match.slice(1,4).map(BigInt),pre};
}
function compareVersions(a,b){
  for(let i=0;i<3;i++)if(a.core[i]!==b.core[i])return a.core[i]>b.core[i]?1:-1;
  if(!a.pre.length||!b.pre.length)return Number(!a.pre.length)-Number(!b.pre.length);
  for(let i=0;i<Math.max(a.pre.length,b.pre.length);i++){
    const x=a.pre[i],y=b.pre[i];if(x===y)continue;
    if(x===undefined)return -1;if(y===undefined)return 1;
    const nx=/^\d+$/.test(x),ny=/^\d+$/.test(y);
    if(nx&&ny)return BigInt(x)>BigInt(y)?1:-1;
    if(nx!==ny)return nx?-1:1;
    return x>y?1:-1;
  }
  return 0;
}
function newestRelease(releases,current){
  const base=versionParts(current);if(!base)throw new Error('현재 버전 형식을 확인할 수 없습니다.');
  if(!Array.isArray(releases))throw new Error('올바르지 않은 릴리스 응답입니다.');
  let best=base,tag=null;
  for(const release of releases){
    if(!release||release.draft)continue;
    const candidate=versionParts(release.tag_name);
    if(!candidate||(!base.pre.length&&(release.prerelease||candidate.pre.length)))continue;
    if(compareVersions(candidate,best)>0){best=candidate;tag=release.tag_name;}
  }
  return tag;
}
async function fetchReleases({signal}={}){
  const response=await fetch(API,{signal,headers:{Accept:'application/vnd.github+json','User-Agent':'QuadFinder'}});
  if(!response.ok)throw new Error(`릴리스 확인 실패 (HTTP ${response.status})`);
  return response.json();
}
module.exports={newestRelease,fetchReleases};
