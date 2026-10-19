const fs=require('node:fs'),{localPath}=require('./files.cjs');
function dragFiles(input){
 if(!Array.isArray(input)||!input.length||input.length>1000)throw new Error('드래그할 파일을 선택하세요.');
 const paths=[...new Set(input.map(localPath))];
 for(const file of paths){const stat=fs.statSync(file);if(!stat.isFile()&&!stat.isDirectory())throw new Error('일반 파일이나 폴더만 드래그할 수 있습니다.');}
 return paths;
}
module.exports={dragFiles};
