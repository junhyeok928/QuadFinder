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
  const dirents = await fs.readdir(directory, { withFileTypes: true });
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
  const words = query.normalize('NFC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.every(word => entry.name.normalize('NFC').toLocaleLowerCase().includes(word))) return false;
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
