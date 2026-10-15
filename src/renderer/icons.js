const paths = {
  logo: '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
  search:'<circle cx="10.8" cy="10.8" r="7.2"/><path d="m16 16 5 5"/>',
  home:'<path d="m3 10 9-7 9 7v10H4V10M9 20v-7h6v7"/>',
  desktop:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  document:'<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  drive:'<path d="m5 5-3 12v4h20v-4L19 5zM2 17h20m-5 2h2"/>',
  folder:'<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  left:'<path d="m14 5-7 7 7 7M7 12h14"/>',
  right:'<path d="m10 5 7 7-7 7M3 12h14"/>',
  up:'<path d="m5 12 7-7 7 7M12 5v16"/>',
  refresh:'<path d="M20 10a8 8 0 1 0-1 8M20 3v7h-7"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  layout1:'<rect x="3" y="4" width="18" height="16" rx="2"/>',
  layout2:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  layout4:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M3 12h18"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
  external:'<path d="M14 3h7v7m0-7L10 14M10 4H4v16h16v-6"/>',
  file:'<path d="M6 3h8l4 4v14H6zM14 3v5h4"/>',
  code:'<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 20"/>',
  archive:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M10 3v10h4V3m-4 13h4v3h-4z"/>',
  video:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 8 6 4-6 4z"/>',
  music:'<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>'
};
// Filled file/place icons follow the approved concept. Toolbar icons stay outlined.
const folder = blue => `<path fill="${blue?'#2385c8':'#d7a641'}" d="M2 5a2 2 0 0 1 2-2h6l2 3h8a2 2 0 0 1 2 2v12H2z"/><path fill="${blue?'#59c1f2':'#f3cd72'}" d="M2 8h20v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/><path fill="${blue?'#85d8fb':'#ffe2a0'}" d="M3 8h18v2H3z"/><path fill="${blue?'#36a6e4':'#e6b954'}" d="M2 17h20v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/>`;
const sheet = (color, letter) => `<path fill="#edf3fa" d="M7 2h10l5 5v14a1 1 0 0 1-1 1H7z"/><path fill="#b6c5d9" d="M17 2v6h5z"/><path fill="${color}" opacity=".65" d="M11 10h8v1h-8zm0 4h8v1h-8zm0 4h8v1h-8z"/><rect x="1" y="6" width="13" height="14" rx="1.5" fill="${color}"/><text x="7.5" y="16.3" fill="white" font-family="Segoe UI,Arial,sans-serif" font-size="10" font-weight="700" text-anchor="middle">${letter}</text>`;
const filled = {
  folder: folder(false), 'folder-blue':folder(true),
  home:'<path fill="#eaa34a" d="m1 11 11-10 11 10-2 2-9-8-9 8z"/><path fill="#e8eef6" d="m4 11 8-7 8 7v11H4z"/><path fill="#50a9e4" d="M10 14h5v8h-5z"/><path fill="#a9cde0" d="M6 12h3v4H6z"/>',
  desktop:'<rect x="1" y="3" width="22" height="16" rx="2" fill="#5bbcf0"/><path fill="#2998d7" d="m2 16 7-6 5 4 8-7v11H2z"/><path fill="#a1dcf8" d="M2 4h20v2H2z"/><path stroke="#b7c7d9" stroke-width="2" d="M12 19v3m-5 0h10"/>',
  download:'<path stroke="#25c1b0" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" fill="none" d="M12 2v14m-6-6 6 6 6-6M4 21h16"/>',
  document:'<rect x="4" y="1" width="16" height="22" rx="2" fill="#9bbbd5"/><path fill="#e5eff8" d="M7 4h10v2H7zm0 5h10v1H7zm0 4h10v1H7zm0 4h7v1H7z"/><path fill="#7393af" d="M17 1h3v22h-3z"/>',
  drive:'<path fill="#9baabc" d="m5 5-4 11h22L19 5z"/><rect x="1" y="14" width="22" height="7" rx="2" fill="#c2cedb"/><path fill="#6c839a" d="M4 16h11v2H4z"/><circle cx="19" cy="17.5" r="1.2" fill="#52bdd8"/><path fill="#d9e3ed" d="M5 7h14l2 5H3z"/>',
  word:sheet('#2461b9','W'), excel:sheet('#24864f','X'), powerpoint:sheet('#cb6036','P'),
  pdf:'<path fill="#f4f7fa" stroke="#ea514a" stroke-width="1.3" d="M5 1.5h10l5 5V22H5z"/><path fill="#fac6c3" d="M15 2v5h5z"/><path fill="none" stroke="#e4463f" stroke-width="1.6" stroke-linecap="round" d="M9 17c6-11 4-15 3-8s6 9 5 6-9-1-9 2 3-1 3-1"/>',
  image:'<rect x="3" y="1" width="18" height="22" rx="2" fill="#e3edf7"/><rect x="5" y="4" width="14" height="16" rx="1" fill="#56aee3"/><circle cx="9" cy="8" r="2" fill="#d0f1ff"/><path fill="#c3e4ed" d="m5 17 5-5 3 3 3-6 3 8v3H5z"/><path fill="#438dc0" d="m5 18 5-4 9 5v1H5z"/>',
  file:'<path fill="#e4ecf5" d="M5 1h10l5 5v17H5z"/><path fill="#afbed0" d="M15 1v6h5z"/><path fill="#778b9f" d="M8 10h9v1.5H8zm0 4h9v1.5H8zm0 4h7v1.5H8z"/>',
  archive:'<rect x="3" y="2" width="18" height="21" rx="2" fill="#e9be62"/><path fill="#ffe09b" d="M3 2h18v5H3z"/><path stroke="#8b6938" stroke-width="3" stroke-dasharray="2 1" d="M12 3v12"/><rect x="10" y="15" width="5" height="5" rx="1" fill="#b18a48"/><rect x="11" y="16" width="3" height="2" fill="#fbe1a6"/>',
  video:'<path fill="#a69bea" d="M5 1h10l5 5v17H5z"/><path fill="#c9c3f4" d="M15 1v6h5z"/><rect x="2" y="8" width="17" height="13" rx="3" fill="#7962cf"/><path fill="#f5f3ff" d="m9 11 6 3.5L9 18z"/>',
  application:'<rect x="2" y="2" width="20" height="21" rx="3" fill="#7dbbea"/><rect x="4" y="5" width="16" height="15" rx="1" fill="#d9edf9"/><path fill="#549fdb" d="m12 7 1.5 2 2.5-.2.4 2.4 1.6 1.8-1.6 1.8-.4 2.4-2.5-.2-1.5 2-1.5-2-2.5.2-.4-2.4L6 13l1.6-1.8.4-2.4 2.5.2z"/><circle cx="12" cy="13" r="2.4" fill="#e9f6ff"/>',
  photoshop:'<rect x="2" y="1" width="20" height="22" rx="3" fill="#091f32" stroke="#2ab3f5" stroke-width="1.4"/><text x="12" y="17" fill="#42c4ff" font-family="Arial" font-size="13" text-anchor="middle">Ps</text>',
  illustrator:'<rect x="2" y="1" width="20" height="22" rx="3" fill="#2c1a0d" stroke="#e69a25" stroke-width="1.4"/><text x="12" y="17" fill="#f4b54a" font-family="Arial" font-size="14" text-anchor="middle">Ai</text>'
};
paths['desktop-small']=paths.desktop;
paths.list='<path d="M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1"/>';
paths.pin='<path d="m9 3 9 4-3 3-1 5-4-2-6 8 4-9-3-2 4-2z"/>';
paths['new-folder']='<path d="M3 6h6l2 3h10v12H3zM16 12v6m-3-3h6"/>';
window.icon = name => filled[name]
  ? `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${filled[name]}</svg>`
  : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = window.icon(element.dataset.icon); });
