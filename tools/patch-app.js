const fs = require('fs');
let s = fs.readFileSync('app.js', 'utf8');
function rep(a, b) { if (!s.includes(a)) throw new Error('anchor not found: ' + a.slice(0, 60)); s = s.replace(a, b); }

// 1. travel score: connections only get the big penalty when they cost a full day
rep(`  function travelScore(so) {
    const h = n(so.flightHours);
    let s = h <= 7.5 ? 5 : h <= 8.5 ? 4 : h <= 10 ? 3 : 2;
    if (so.direct === 'no') s -= 1.5;
    else if (so.direct === 'seasonal') s -= 0.5;
    return clamp(s, 1, 5);
  }`,
`  /* Travel time: from flight hours, then a nonstop adjustment.
     Decision 2026-10-03: a connection or short stopover is fine if it lands
     us at base 1 the same day, so a missing nonstop is only a small knock
     (-0.5 for 'no', -0.25 for 'seasonal'). If the sub-option's
     connectionCostsDay is "yes" the old full penalty (-1.5) applies. */
  function travelScore(so) {
    const h = n(so.flightHours);
    let s = h <= 7.5 ? 5 : h <= 8.5 ? 4 : h <= 10 ? 3 : 2;
    if (so.direct !== 'yes') {
      if (so.connectionCostsDay === 'yes') s -= 1.5;
      else s -= so.direct === 'no' ? 0.5 : 0.25;
    }
    return clamp(s, 1, 5);
  }
  const hasPlan = so => !!(so && so.detail);
  const planBadge = () => '<span class="badge plan" title="Has a day-by-day plan">Has plan</span>';`);

// 2. migration on load
rep(`      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.buckets)) return parsed;
      }`,
`      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.buckets)) return migrate(parsed);
      }`);
rep(`  function save() {`,
`  /* When data.js is newer than the saved copy (its \`version\` is higher),
     fold the new defaults into the saved state WITHOUT overwriting edits:
     - new buckets / sub-options / questions / log entries are added by id
     - a sub-option that gains a \`detail\` block also takes the default's
       verify list (union) and status/statusReason
     - a group question whose saved answer is empty takes the default answer
     Anything the user already typed is left alone. Reset still wipes all. */
  function migrate(saved) {
    const def = window.TRIP_DATA;
    if (!def || n(saved.version) >= n(def.version)) return saved;
    const norm = x => String(x).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    def.buckets.forEach(db => {
      let sb = saved.buckets.find(b => b.id === db.id);
      if (!sb) { saved.buckets.push(deepClone(db)); return; }
      (db.subOptions || []).forEach(dso => {
        const sso = (sb.subOptions = sb.subOptions || []).find(x => x.id === dso.id);
        if (!sso) { sb.subOptions.push(deepClone(dso)); return; }
        if (dso.connectionCostsDay && !sso.connectionCostsDay) sso.connectionCostsDay = dso.connectionCostsDay;
        if (dso.detail && !sso.detail) {
          sso.detail = deepClone(dso.detail);
          const seen = new Set((sso.verify || []).map(norm));
          (dso.verify || []).forEach(v => { if (!seen.has(norm(v))) { seen.add(norm(v)); (sso.verify = sso.verify || []).push(v); } });
          sso.status = dso.status;
          sso.statusReason = dso.statusReason;
        }
      });
    });
    (def.groupQuestions || []).forEach(dq => {
      const sq = (saved.groupQuestions = saved.groupQuestions || []).find(q => q.id === dq.id);
      if (!sq) { saved.groupQuestions.push(deepClone(dq)); return; }
      if (dq.answer && !sq.answer) { sq.answer = dq.answer; sq.status = dq.status; }
    });
    (def.decisionLog || []).forEach(de => {
      if (!(saved.decisionLog = saved.decisionLog || []).some(e => e.id === de.id)) saved.decisionLog.push(deepClone(de));
    });
    saved.version = def.version;
    setTimeout(() => flash('Merged data.js v' + def.version + ' updates into your saved data'), 300);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch (e) {}
    return saved;
  }

  function save() {`);

// 3. ordered list helper (for days7 / days10)
rep(`  /* Editable checkable to-do list. */`,
`  /* Editable NUMBERED string list (day-by-day plans). */
  function orderedList(path, items, label) {
    items = items || [];
    return '<ol class="list days">' +
      items.map((t, i) => '<li><span class="num">' + (i + 1) + '</span><textarea data-bind="' + path + '.' + i + '" rows="2">' + esc(t) + '</textarea>' +
        '<button type="button" class="tiny" data-action="remove-item" data-path="' + path + '" data-index="' + i + '" title="Remove">✕</button></li>').join('') +
      '</ol><div class="addrow"><button type="button" class="tiny" data-action="add-item" data-path="' + path + '">+ add ' + esc(label) + '</button></div>';
  }
  /* Editable checkable to-do list. */`);

// 4. Overview: Has plan badges on bucket cards and ranking table
rep(`        (top ? '<p class="small">Top sketch at current weights: <b>' + esc(top.so.name) + '</b> <span class="score">' + top.score.toFixed(2) + '</span></p>' : '') +`,
`        (top ? '<p class="small">Top sketch at current weights: <b>' + esc(top.so.name) + '</b> <span class="score">' + top.score.toFixed(2) + '</span></p>' : '') +
        ((b.subOptions || []).some(hasPlan) ? '<p class="small">' + planBadge() + ' ' + (b.subOptions || []).filter(hasPlan).map(so => esc(so.name)).join(' · ') + '</p>' : '') +`);
rep(`      html += '<tr><td class="num">' + (i + 1) + '</td><td class="name"><a href="#detail/' + esc(r.b.id) + '">' + esc(r.so.name) + '</a></td>`,
`      html += '<tr><td class="num">' + (i + 1) + '</td><td class="name"><a href="#detail/' + esc(r.b.id) + '">' + esc(r.so.name) + '</a>' + (hasPlan(r.so) ? ' ' + planBadge() : '') + '</td>`);

// 5. Compare grid: Has plan badge in the name cell
rep(`        '<td class="name"><a href="#detail/' + esc(r.b.id) + '">' + esc(so.name) + '</a>' + (v ? ' <span class="tag verify" title="' + v + ' items to verify">' + v + '</span>' : '') +`,
`        '<td class="name"><a href="#detail/' + esc(r.b.id) + '">' + esc(so.name) + '</a>' + (hasPlan(so) ? ' ' + planBadge() : '') + (v ? ' <span class="tag verify" title="' + v + ' items to verify">' + v + '</span>' : '') +`);
rep(`    html += '<p class="legend">Flight hours are rough gate-to-gate`,
`    html += '<p class="legend">Travel score: a missing nonstop now costs only −0.5 (−0.25 if seasonal) unless the sketch is flagged "connection costs a full day", per the 2026-10-03 flights decision. ';
    html += 'Flight hours are rough gate-to-gate`);

// 6. Detail: plan section; verify list moves into Plan when a detail block exists
rep(`      field('Nonstop exists?', P + '.direct', so.direct, 'select', { options: ['yes', 'seasonal', 'no'] }) +`,
`      field('Nonstop exists?', P + '.direct', so.direct, 'select', { options: ['yes', 'seasonal', 'no'] }) +
      field('Connection costs a full day?', P + '.connectionCostsDay', so.connectionCostsDay || 'no', 'select', { options: ['no', 'yes'] }) +`);
rep(`      '<div><h4>' + verifyTag() + ' Needs verification</h4>' + stringList(P + '.verify', so.verify, 'verify item') + '</div>' +
      '</div>' +
      '</div></details>';`,
`      (hasPlan(so) ? '' : '<div><h4>' + verifyTag() + ' Needs verification</h4>' + stringList(P + '.verify', so.verify, 'verify item') + '</div>') +
      '</div>' +
      renderPlan(so, P, bi, si) +
      '</div></details>';
  }

  /* The "Plan" section: only rendered when the sub-option has a \`detail\`
     block. Verify items live on the sub-option's main \`verify\` list (the
     detail.verify items were merged into it), so one editor covers both. */
  function renderPlan(so, P, bi, si) {
    if (!hasPlan(so)) {
      return '<div class="row no-print" style="margin-top:1rem"><button type="button" class="tiny" data-action="add-plan" data-bucket="' + bi + '" data-sub="' + si + '">+ add a day-by-day plan</button></div>';
    }
    const d = so.detail, D = P + '.detail';
    return '<section class="plan">' +
      '<div class="row" style="justify-content:space-between"><h3 style="margin:0">' + planBadge() + ' Plan</h3>' +
      '<button type="button" class="tiny danger no-print" data-action="remove-plan" data-bucket="' + bi + '" data-sub="' + si + '">remove plan</button></div>' +
      '<h4>Arrival</h4><div class="fields">' + field('Arrival', D + '.arrival', d.arrival, 'textarea', { wide: true, rows: 3 }) + '</div>' +
      '<h4>Lodging</h4><div class="fields">' + field('Lodging (adults need a shared evening space)', D + '.lodging', d.lodging, 'textarea', { wide: true, rows: 3 }) + '</div>' +
      '<h4>7 nights</h4>' + orderedList(D + '.days7', d.days7, 'day') +
      '<h4>10 nights</h4>' + orderedList(D + '.days10', d.days10, 'day') +
      '<h4>Anchors</h4><div class="twocol">' +
      '<div>' + field('Kids', D + '.anchorsKids', d.anchorsKids, 'textarea', { wide: true, rows: 3 }) + '</div>' +
      '<div>' + field('Adults', D + '.anchorsAdults', d.anchorsAdults, 'textarea', { wide: true, rows: 3 }) + '</div></div>' +
      '<h4>May week</h4><div class="fields">' + field('Which May week, and what it changes', D + '.mayWeek', d.mayWeek, 'textarea', { wide: true, rows: 3 }) + '</div>' +
      '<h4>' + verifyTag() + ' Verify</h4>' + stringList(P + '.verify', so.verify, 'verify item') +
      '</section>';`);

// 7. actions: add-plan / remove-plan
rep(`      case 'add-bucket': {`,
`      case 'add-plan': {
        const so = state.buckets[+a.bucket].subOptions[+a.sub];
        so.detail = { arrival: '', lodging: '', days7: [], days10: [], anchorsKids: '', anchorsAdults: '', mayWeek: '', verify: [] };
        ui.open.add(so.id);
        save(); render(); break;
      }
      case 'remove-plan': {
        const so = state.buckets[+a.bucket].subOptions[+a.sub];
        if (!confirm('Remove the day-by-day plan for "' + so.name + '"? (Its verify items stay on the sketch.)')) break;
        delete so.detail;
        save(); render(); break;
      }
      case 'add-bucket': {`);
rep(`      flightHours: 8, direct: 'yes', flightNote: '',`, `      flightHours: 8, direct: 'yes', connectionCostsDay: 'no', flightNote: '',`);

fs.writeFileSync('app.js', s);
console.log('app.js patched');

// ---------- styles.css ----------
let c = fs.readFileSync('styles.css', 'utf8');
c = c.replace(`.badge.decided { background: var(--ok); }`,
`.badge.decided { background: var(--ok); }
.badge.plan { background: #6b46c1; }`);
c = c.replace(`.addrow { margin-top: .3rem; }`,
`.addrow { margin-top: .3rem; }
ol.list.days { padding: 0; }
ol.list.days li { align-items: flex-start; }
ol.list.days .num { flex: 0 0 1.6rem; font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; padding-top: .35rem; }
ol.list.days textarea { flex: 1; min-height: 2.4em; }
.plan { margin-top: 1.2rem; padding: .8rem 1rem 1rem; border: 1px solid #d9d1f0; border-radius: var(--radius); background: #faf8ff; }
.plan h3 { display: flex; gap: .5rem; align-items: center; }`);
c = c.replace(`  details.sub { page-break-inside: avoid; }`,
`  details.sub { page-break-inside: auto; }
  .plan { background: #fff; border-color: #bbb; }`);
fs.writeFileSync('styles.css', c);
console.log('styles.css patched');
