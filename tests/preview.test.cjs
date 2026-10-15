const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
const {preview}=require('../src/file-preview.cjs');
test('preview bounds reads, preserves literal text and does not render unknown formats',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'quadfinder-preview-'));
  try{
    const text=path.join(root,'sample.html');await fs.writeFile(text,'<script>danger()</script>'+'a'.repeat(150000));
    const result=await preview(text);assert.equal(result.kind,'text');assert.equal(result.text.length,128*1024);assert(result.truncated);assert(result.text.startsWith('<script>danger()'));
    assert.equal((await preview(root)).kind,'folder');const other=path.join(root,'sample.exe');await fs.writeFile(other,'binary');assert.equal((await preview(other)).kind,'unsupported');
    const pdf=path.join(root,'sample.pdf');await fs.writeFile(pdf,'%PDF');assert.equal((await preview(pdf,{pdfURL:()=> 'quadfinder://preview/token'})).url,'quadfinder://preview/token');
    const utf16=path.join(root,'utf16.txt');await fs.writeFile(utf16,Buffer.concat([Buffer.from([255,254]),Buffer.from('한글 파일','utf16le')]));assert.equal((await preview(utf16)).text,'한글 파일');
  }finally{assert(path.basename(root).startsWith('quadfinder-preview-'));await fs.rm(root,{recursive:true,force:true});}
});
