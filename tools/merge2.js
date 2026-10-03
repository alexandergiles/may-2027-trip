// Merge plans2.json detail blocks into data.js by text insertion; set status shortlisted; log; version 3.
const fs = require('fs');
let src = fs.readFileSync('data.js', 'utf8');
const details = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const IND = '          ';
function js(v, indent) {
  if (Array.isArray(v)) return v.length ? '[\n' + v.map(x => indent + '  ' + js(x, indent + '  ')).join(',\n') + ',\n' + indent + ']' : '[]';
  if (v && typeof v === 'object') return '{\n' + Object.keys(v).map(k => indent + '  ' + k + ': ' + js(v[k], indent + '  ')).join(',\n') + ',\n' + indent + '}';
  return JSON.stringify(v);
}
const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const names = [];
for (const [id, det] of Object.entries(details)) {
  const idIdx = src.indexOf('\n' + IND + 'id: "' + id + '"');
  if (idIdx < 0) throw new Error('not found ' + id);
  names.push(src.slice(idIdx).match(/name: "([^"]*)"/)[1]);
  const statusIdx = src.indexOf('\n' + IND + 'status: "', idIdx);
  const vStart = src.indexOf('\n' + IND + 'verify: [', idIdx);
  if (vStart < 0 || vStart > statusIdx) throw new Error('verify not found ' + id);
  const vEnd = src.indexOf('\n' + IND + '],', vStart);
  const existing = new Function('return ' + src.slice(src.indexOf('[', vStart), vEnd + 1 + IND.length + 1))();
  const seen = new Set(existing.map(norm)); const merged = existing.slice();
  (det.verify || []).forEach(v => { if (!seen.has(norm(v))) { seen.add(norm(v)); merged.push(v); } });
  src = src.slice(0, vStart + 1) + IND + 'verify: ' + js(merged, IND) + ',' + src.slice(vEnd + 1 + IND.length + 2);
  const s2 = src.indexOf('\n' + IND + 'status: "', idIdx);
  const rStart = src.indexOf('\n' + IND + 'statusReason: "', s2);
  const rEnd = src.indexOf('\n', rStart + 1);
  const oldReason = src.slice(rStart, rEnd).match(/statusReason: "(.*)",?$/)[1];
  const block = IND + 'detail: ' + js(det, IND) + ',\n' + IND + 'status: "shortlisted",\n' +
    IND + 'statusReason: ' + JSON.stringify('Shortlisted 2026-10-03 (top ten) with a detailed plan. ' + oldReason) + ',';
  src = src.slice(0, s2 + 1) + block + src.slice(rEnd);
}
const entry = { id: 'log-7', date: '2026-10-03', text: 'Expanded the shortlist to ten: added day-by-day plans for ' + names.join(', ') + '.', reason: 'The public shortlist page shows the top ten by score, and every sketch on it needs a plan the family can read.' };
const logClose = src.lastIndexOf('\n  ],\n};');
src = src.slice(0, logClose) + '\n    ' + JSON.stringify(entry).replace(/"(\w+)":/g, '$1: ').replace(/,(\w+): /g, ', $1: ').replace(/^\{/, '{ ').replace(/\}$/, ' }') + ',' + src.slice(logClose);
src = src.replace('  version: 2,', '  version: 3,');
fs.writeFileSync('data.js', src);
console.log('merged:', names.join(' | '));
