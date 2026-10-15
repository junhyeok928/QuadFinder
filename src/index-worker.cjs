const { parentPort, workerData } = require('node:worker_threads');
const { listDirectory, matches } = require('./files.cjs');
const entries = [];
let indexing = false;
let skipped = 0;
let limited = false;
const MAX_ENTRIES = 250000;
const ignored = new Set(['node_modules', '.git', '$Recycle.Bin', 'System Volume Information']);

async function build() {
  indexing = true;
  parentPort.postMessage({ type: 'status', indexing, count: 0, skipped, limited });
  const queue = [...new Set(workerData.roots)];
  const visited = new Set();
  let offset = 0;
  while (offset < queue.length && entries.length < MAX_ENTRIES) {
    const directory = queue[offset++];
    const key = directory.toLowerCase();
    if (visited.has(key)) continue;
    visited.add(key);
    try {
      const result = await listDirectory(directory);
      for (const entry of result.entries) {
        if (entry.link || ignored.has(entry.name)) continue;
        entries.push(entry);
        if (entry.directory) queue.push(entry.path);
        if (entries.length >= MAX_ENTRIES) { limited = true; break; }
      }
    } catch { skipped++; }
    if (offset % 20 === 0) parentPort.postMessage({ type: 'status', indexing, count: entries.length, skipped, limited });
  }
  indexing = false;
  parentPort.postMessage({ type: 'status', indexing, count: entries.length, skipped, limited });
}

parentPort.on('message', ({ id, query, filter }) => {
  const results = [];
  let total = 0;
  if (query.trim()) for (const entry of entries) {
    if (matches(entry, query, filter)) { total++; if (results.length < 1000) results.push(entry); }
  }
  parentPort.postMessage({ type: 'results', id, entries: results, total, indexing });
});
build().catch(error => parentPort.postMessage({ type: 'error', message: error.message }));
