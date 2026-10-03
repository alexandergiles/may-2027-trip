// One-off: merge sketch-details.json into data.js by text insertion (keeps comments).
const fs = require('fs');
let src = fs.readFileSync('data.js', 'utf8');
const details = JSON.parse(fs.readFileSync('sketch-details.json', 'utf8'));
const IND = '          '; // sub-option field indent (10 spaces)

function js(v, indent) {
  // Serialize to hand-editable JS: unquoted identifier keys, double-quoted strings.
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return '[\n' + v.map(x => indent + '  ' + js(x, indent + '  ')).join(',\n') + ',\n' + indent + ']';
  }
  if (v && typeof v === 'object') {
    return '{\n' + Object.keys(v).map(k => indent + '  ' + k + ': ' + js(v[k], indent + '  ')).join(',\n') + ',\n' + indent + '}';
  }
  return JSON.stringify(v);
}

let changed = [];
for (const [id, det] of Object.entries(details)) {
  if (id === '_readme') continue;
  const idIdx = src.indexOf('\n' + IND + 'id: "' + id + '"');
  if (idIdx < 0) throw new Error('sub-option not found: ' + id);
  const statusIdx = src.indexOf('\n' + IND + 'status: "', idIdx);
  if (statusIdx < 0) throw new Error('status not found after ' + id);
  // --- merge verify list ---
  const vStart = src.indexOf('\n' + IND + 'verify: [', idIdx);
  if (vStart < 0 || vStart > statusIdx) throw new Error('verify not found for ' + id);
  const vEnd = src.indexOf('\n' + IND + '],', vStart);
  const arrText = src.slice(src.indexOf('[', vStart), vEnd + 1 + IND.length + 1);
  const existing = new Function('return ' + arrText)();
  const merged = existing.slice();
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const seen = new Set(existing.map(norm));
  for (const v of det.verify || []) { if (!seen.has(norm(v))) { seen.add(norm(v)); merged.push(v); } }
  const detailCopy = Object.assign({}, det); // keep detail.verify in the block too (source of record)
  const newVerify = IND + 'verify: ' + js(merged, IND) + ',';
  src = src.slice(0, vStart + 1) + newVerify + src.slice(vEnd + 1 + IND.length + 2);
  // --- insert detail block before status, set status ---
  const statusIdx2 = src.indexOf('\n' + IND + 'status: "', idIdx);
  const lineEnd = src.indexOf('\n', statusIdx2 + 1);
  const reasonStart = src.indexOf('\n' + IND + 'statusReason: "', statusIdx2);
  const reasonEnd = src.indexOf('\n', reasonStart + 1);
  const oldReason = src.slice(reasonStart, reasonEnd).match(/statusReason: "(.*)",?$/)[1];
  const block = IND + 'detail: ' + js(detailCopy, IND) + ',\n' +
                IND + 'status: "shortlisted",\n' +
                IND + 'statusReason: ' + JSON.stringify('Shortlisted 2026-10-03 with a detailed plan (see Plan below). ' + oldReason) + ',';
  src = src.slice(0, statusIdx2 + 1) + block + src.slice(reasonEnd);
  changed.push(id + ' (verify ' + existing.length + ' → ' + merged.length + ')');
}

// --- connectionCostsDay flag on every sub-option: after the `direct:` line ---
src = src.replace(/\n(          direct: "(yes|seasonal|no)",)\n/g, '\n$1\n          connectionCostsDay: "no",\n');

// --- group question answers ---
const gq = {
  'gq-lodging': 'Any format works as long as the adults have a shared living space in the evening after the kids are down (house, apartment, aparthotel suite, or two adjacent units). Hotels and separate rentals are acceptable.',
  'gq-flights': 'Nonstop preferred; a connection or short stopover is fine if it lands us at base 1 the same day. Avoid losing a full day to travel.',
  'gq-pace': '3 nights per base is a preference, not a rule; relax it for the right itinerary. The goal is minimizing days lost to transit.',
};
for (const [id, ans] of Object.entries(gq)) {
  const re = new RegExp('(\\{ id: "' + id + '", text: "[^"]*", status: )"open"(, answer: )""(, due: "[^"]*" \\})');
  if (!re.test(src)) throw new Error('group question not found: ' + id);
  src = src.replace(re, '$1"decided"$2' + JSON.stringify(ans) + '$3');
}

// --- decision log entries ---
const logEntries = [
  { id: 'log-3', date: '2026-10-03', text: 'Lodging format decided: any format works if the adults have a shared living space in the evening after the kids are down (house, apartment, aparthotel suite, or two adjacent units). Hotels and separate rentals are acceptable.', reason: 'Evening adult time is the real requirement; the house-vs-hotel label was a proxy for it.' },
  { id: 'log-4', date: '2026-10-03', text: 'Flights decided: nonstop preferred, but a connection or short stopover is fine if it lands us at base 1 the same day.', reason: 'The thing to avoid is losing a full day to travel, not the connection itself. Opens up Poland, Seville and Austria.' },
  { id: 'log-5', date: '2026-10-03', text: 'Pace decided: 3 nights per base is a preference, not a rule; relax it for the right itinerary.', reason: 'The goal is minimizing days lost to transit, which three-base rail trips can still achieve.' },
  { id: 'log-6', date: '2026-10-03', text: 'Shortlisted five sketches with detailed plans: Lisbon + Porto, London + Edinburgh + Highlands by rail, Lucerne + Berner Oberland, Munich + Garmisch, Berlin + Dresden (+ Prague).', reason: 'These are the ones worth planning day by day; the rest stay as ideas or research.' },
];
const logClose = src.lastIndexOf('\n  ],\n};');
src = src.slice(0, logClose) + '\n' + logEntries.map(e => '    ' + JSON.stringify(e).replace(/"(\w+)":/g, '$1: ').replace(/,(\w+): /g, ', $1: ').replace(/^\{/, '{ ').replace(/\}$/, ' }') + ',').join('\n') + src.slice(logClose);

// --- version + field reference ---
src = src.replace('  version: 1,', '  version: 2,');
src = src.replace(
  "     direct                 yes | seasonal | no   (nonstop to the gateway airport)\n",
  "     direct                 yes | seasonal | no   (nonstop to the gateway airport)\n" +
  "     connectionCostsDay     yes | no  — does the connection cost a full travel day?\n" +
  "                            (only then does a missing nonstop get the big travel penalty)\n");
src = src.replace(
  "     status                 idea | researching | shortlisted | rejected\n",
  "     status                 idea | researching | shortlisted | rejected\n");
src = src.replace(
  "     statusReason           text\n   =====",
  "     statusReason           text\n" +
  "     detail                 optional day-by-day plan: { arrival, lodging, days7[], days10[],\n" +
  "                            anchorsKids, anchorsAdults, mayWeek, verify[] }. Rendered as\n" +
  "                            the \"Plan\" section and the \"Has plan\" badge.\n   =====");
fs.writeFileSync('data.js', src);
console.log('merged:', changed.join('; '));
