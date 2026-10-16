const BASE=.9,VERSION=2;
const normalize=value=>Math.max(.7,Math.min(1.5,Math.round((Number.isFinite(value)?value:1)*100)/100));
const physical=value=>Math.round(normalize(value)*BASE*1000)/1000;
function restore(layout){const value=layout?.zoomFactor;if(layout?.zoomVersion===VERSION)return normalize(value);if(!Number.isFinite(value)||value===1||value===.9)return 1;return normalize(value/BASE);}
module.exports={BASE,VERSION,normalize,physical,restore};
