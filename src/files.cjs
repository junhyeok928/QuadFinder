const fs = require('node:fs/promises');
const path = require('node:path');

function localPath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0') || /^(\\\\|\/\/)/.test(value)) {
    throw new Error('올바른 로컬 절대 경로를 입력하세요.');
  }
  return path.normalize(value);
}

async function listDirectory(value) {
  const directory = localPath(value);
  const dirents = (await fs.readdir(directory, { withFileTypes: true })).filter(item=>!item.name.startsWith('.quadfinder-'));
  const entries = [];
  // Bounded batches avoid flooding the filesystem with stat requests.
  for (let offset = 0; offset < dirents.length; offset += 32) {
    entries.push(...await Promise.all(dirents.slice(offset, offset + 32).map(async item => {
      const fullPath = path.join(directory, item.name);
      try {
        const stat = await fs.lstat(fullPath);
        return { name: item.name, path: fullPath, parent: directory, directory: item.isDirectory(),
          link: item.isSymbolicLink(), size: stat.size, modified: stat.mtimeMs, extension: path.extname(item.name).toLowerCase() };
      } catch { return null; }
    })));
  }
  return { path: directory, parent: path.dirname(directory), entries: entries.filter(Boolean).sort(compareEntries) };
}

function compareEntries(a, b) {
  return Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, 'ko', { numeric: true });
}

function matches(entry, query, filter = 'all') {
  const words = (query.normalize('NFC').toLocaleLowerCase().match(/(?:[^\s"]+|"[^"]*")+/g)||[]).map(word=>word.replace(/"/g,''));
  const name=entry.name.normalize('NFC').toLocaleLowerCase();
  if(!words.every(word=>{
    if(word.startsWith('ext:'))return !entry.directory&&word.slice(4).split(/[;,|]/).some(ext=>name.endsWith('.'+ext.replace(/^\./,'')));
    if(word.startsWith('path:'))return (entry.path||'').normalize('NFC').toLocaleLowerCase().includes(word.slice(5));
    if(word.startsWith('size:')){
      const match=word.slice(5).match(/^(>=|<=|>|<|=)?(\d+(?:\.\d+)?)(b|kb|mb|gb|tb)?$/);
      if(!match||entry.directory)return false;
      const amount=Number(match[2])*1024**({b:0,kb:1,mb:2,gb:3,tb:4}[match[3]||'b']);
      return ({'>':entry.size>amount,'<':entry.size<amount,'>=':entry.size>=amount,'<=':entry.size<=amount,'=':entry.size===amount})[match[1]||'='];
    }
    if(/[?*]/.test(word)){const escaped=word.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\?/g,'.');return new RegExp('^'+escaped+'$','u').test(name);}
    return name.includes(word);
  }))return false;
  if (filter === 'documents') return !entry.directory && /\.(pdf|docx?|xlsx?|pptx?|txt|md|csv|hwp|hwpx)$/i.test(entry.name);
  if (filter === 'images') return !entry.directory && /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic)$/i.test(entry.name);
  if (filter === 'recent') return entry.modified >= Date.now() - 7 * 86400000;
  return true;
}

function childPath(parent, name) {
  if (typeof name !== 'string' || !name.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)) {
    throw new Error('Windows에서 사용할 수 없는 이름입니다.');
  }
  return path.join(localPath(parent), name);
}

async function createFolder(parent, name) {
  const destination = childPath(parent, name);
  await fs.mkdir(destination); // Never silently re-use or overwrite an existing folder.
  return destination;
}

module.exports = { localPath, listDirectory, compareEntries, matches, childPath, createFolder };
