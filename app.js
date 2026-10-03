/* =====================================================================
   app.js — May 2027 trip planner
   Vanilla JS, no build step. Works from file://.

   How it fits together
   - data.js defines window.TRIP_DATA (the defaults).
   - On load we read saved state from localStorage; if none, we deep-copy
     TRIP_DATA. Every edit writes back to localStorage.
   - The URL hash picks the view: #overview, #compare, #detail/<bucketId>,
     #questions, #log.
   - Rendering is "dumb": each view builds an HTML string from `state`
     and sets innerHTML. Inputs carry data-bind="dotted.path.into.state";
     a single document-level listener writes changes back.
   - Buttons carry data-action="..." and are handled in one switch.
   ===================================================================== */
(function () {
  'use strict';

  const STORAGE_KEY = 'may2027-trip-planner-v1';

  /* Criteria used by the Compare grid. `score(so)` maps a sub-option to
     a 1–5 value for that criterion. Weights live in state.weights. */
  const CRITERIA = [
    { key: 'rail',    label: 'Rail-friendliness',  help: '5 = whole trip by train, no car',             score: so => n(so.rail) },
    { key: 'kid',     label: 'Kid appeal',         help: 'average of the 3 y.o. and 7 y.o. scores',     score: so => (n(so.kid3) + n(so.kid7)) / 2 },
    { key: 'scenery', label: 'Scenery / towns',    help: '',                                             score: so => n(so.scenery) },
    { key: 'history', label: 'History / novelty',  help: '',                                             score: so => n(so.history) },
    { key: 'travel',  label: 'Travel time',        help: 'from flight hours; minus if no nonstop',       score: travelScore },
    { key: 'beach',   label: 'Beach day',          help: 'yes = 5, limited = 3, no = 1',                 score: so => ({ yes: 5, limited: 3, no: 1 })[so.beach] || 1 },
    { key: 'cost',    label: 'Cost (cheaper = higher)', help: 'tiebreaker — default weight near zero',  score: so => 6 - clamp(n(so.costTier), 1, 5) },
  ];

  const STATUSES = ['idea', 'researching', 'shortlisted', 'rejected'];
  const TYPES = ['city', 'mountains', 'mixed', 'coast'];

  let state;           // the live, persisted data
  const ui = {         // transient UI state (not persisted)
    tab: 'overview',
    bucket: null,
    sort: { key: 'score', dir: -1 },
    open: new Set(),   // which sub-option <details> are expanded
  };

  /* ------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------ */
  const $ = sel => document.querySelector(sel);
  const n = v => (v === '' || v == null || isNaN(+v)) ? 0 : +v;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const deepClone = o => JSON.parse(JSON.stringify(o));
  const uid = p => (p || 'id') + '-' + Math.random().toString(36).slice(2, 8);
  const today = () => new Date().toISOString().slice(0, 10);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* Escape text and turn the literal token [verify] into a visible tag. */
  function fmt(s) {
    return esc(s).replace(/\[verify\]/gi, '<span class="tag verify">verify</span>');
  }
  const verifyTag = () => '<span class="tag verify">verify</span>';

  function dots(v, max = 5) {
    v = clamp(Math.round(n(v)), 0, max);
    return '<span class="dots" title="' + v + ' / ' + max + '">' + '●'.repeat(v) + '<span class="off">' + '●'.repeat(max - v) + '</span></span>';
  }
  const badge = s => '<span class="badge ' + esc(s) + '">' + esc(s) + '</span>';
  function selectHtml(path, value, options, extra) {
    return '<select data-bind="' + path + '" ' + (extra || '') + '>' +
      options.map(o => '<option value="' + esc(o) + '"' + (o === value ? ' selected' : '') + '>' + esc(o) + '</option>').join('') +
      '</select>';
  }

  /* Dotted-path get/set so inputs can bind to any spot in state. */
  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const parent = keys.reduce((o, k) => (o[k] == null ? (o[k] = {}) : o[k]), obj);
    parent[last] = value;
  }

  /* ------------------------------------------------------------------
     Scoring
     ------------------------------------------------------------------ */
  /* Travel time: from flight hours, then a nonstop adjustment.
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
  const planBadge = () => '<span class="badge plan" title="Has a day-by-day plan">Has plan</span>';
  function weightedScore(so) {
    let num = 0, den = 0;
    CRITERIA.forEach(c => {
      const w = n(state.weights[c.key]);
      num += w * c.score(so);
      den += w;
    });
    return den ? num / den : 0;
  }
  /* Flat list of every sub-option with its bucket and score. */
  function allSubOptions() {
    const out = [];
    state.buckets.forEach((b, bi) => (b.subOptions || []).forEach((so, si) => {
      out.push({ b, bi, so, si, score: weightedScore(so) });
    }));
    return out;
  }
  function ranked() {
    return allSubOptions().sort((a, b) => b.score - a.score);
  }

  /* ------------------------------------------------------------------
     Persistence
     ------------------------------------------------------------------ */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.buckets)) return migrate(parsed);
      }
    } catch (e) { console.warn('Could not read saved state', e); }
    return deepClone(window.TRIP_DATA);
  }
  /* When data.js is newer than the saved copy (its `version` is higher),
     fold the new defaults into the saved state WITHOUT overwriting edits:
     - new buckets / sub-options / questions / log entries are added by id
     - a sub-option that gains a `detail` block also takes the default's
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

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const el = $('#saveStatus');
      if (el) el.textContent = 'Saved ' + new Date().toLocaleTimeString() + ' (this browser only — Export JSON to keep a file).';
    } catch (e) {
      alert('Could not save to localStorage: ' + e.message);
    }
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'may-2027-trip-' + today() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    flash('Exported ' + a.download);
  }
  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.buckets)) throw new Error('No "buckets" array found.');
        if (!parsed.weights) parsed.weights = deepClone(window.TRIP_DATA.weights);
        if (!parsed.groupQuestions) parsed.groupQuestions = [];
        if (!parsed.decisionLog) parsed.decisionLog = [];
        if (!parsed.meta) parsed.meta = deepClone(window.TRIP_DATA.meta);
        state = parsed;
        save();
        render();
        flash('Imported ' + file.name);
      } catch (e) {
        alert('Import failed: ' + e.message);
      }
    };
    reader.readAsText(file);
  }
  function resetDefaults() {
    if (!confirm('Reset everything to the defaults in data.js? Browser edits will be lost (Export first if you want them).')) return;
    localStorage.removeItem(STORAGE_KEY);
    state = deepClone(window.TRIP_DATA);
    save();
    render();
    flash('Reset to data.js defaults');
  }
  function flash(msg) {
    let el = $('.flash');
    if (!el) { el = document.createElement('div'); el.className = 'flash'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 1800);
  }

  /* ------------------------------------------------------------------
     Routing
     ------------------------------------------------------------------ */
  function readHash() {
    const h = (location.hash || '#overview').slice(1);
    const [tab, arg] = h.split('/');
    ui.tab = ['overview', 'compare', 'detail', 'questions', 'log'].includes(tab) ? tab : 'overview';
    if (ui.tab === 'detail') {
      const ids = state.buckets.map(b => b.id);
      ui.bucket = ids.includes(arg) ? arg : (ui.bucket && ids.includes(ui.bucket) ? ui.bucket : ids[0]);
    }
  }

  /* ------------------------------------------------------------------
     Render: shared bits
     ------------------------------------------------------------------ */
  function render() {
    readHash();
    document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === ui.tab));
    const views = { overview: renderOverview, compare: renderCompare, detail: renderDetail, questions: renderQuestions, log: renderLog };
    $('#app').innerHTML = views[ui.tab]();
  }

  /* A labelled input bound to a state path. kind: text | textarea | number | select */
  function field(label, path, value, kind, opts) {
    opts = opts || {};
    let input;
    if (kind === 'textarea') input = '<textarea data-bind="' + path + '" rows="' + (opts.rows || 3) + '">' + esc(value) + '</textarea>';
    else if (kind === 'number') input = '<input type="number" data-bind="' + path + '" value="' + esc(value) + '" min="' + (opts.min ?? 0) + '" max="' + (opts.max ?? 99) + '" step="' + (opts.step || 1) + '">';
    else if (kind === 'select') input = selectHtml(path, value, opts.options);
    else input = '<input type="text" data-bind="' + path + '" value="' + esc(value) + '">';
    const v = /\[verify\]/i.test(String(value)) ? ' ' + verifyTag() : '';
    return '<label class="field' + (opts.wide ? ' wide' : '') + '"><span class="lbl">' + esc(label) + v + '</span>' + input + '</label>';
  }

  /* Editable string list (open questions, verify items). */
  function stringList(path, items, placeholderLabel) {
    items = items || [];
    return '<ul class="list">' +
      items.map((t, i) => '<li><input type="text" data-bind="' + path + '.' + i + '" value="' + esc(t) + '">' +
        '<button type="button" class="tiny" data-action="remove-item" data-path="' + path + '" data-index="' + i + '" title="Remove">✕</button></li>').join('') +
      '</ul><div class="addrow"><button type="button" class="tiny" data-action="add-item" data-path="' + path + '">+ add ' + esc(placeholderLabel) + '</button></div>';
  }
  /* Editable NUMBERED string list (day-by-day plans). */
  function orderedList(path, items, label) {
    items = items || [];
    return '<ol class="list days">' +
      items.map((t, i) => '<li><span class="num">' + (i + 1) + '</span><textarea data-bind="' + path + '.' + i + '" rows="2">' + esc(t) + '</textarea>' +
        '<button type="button" class="tiny" data-action="remove-item" data-path="' + path + '" data-index="' + i + '" title="Remove">✕</button></li>').join('') +
      '</ol><div class="addrow"><button type="button" class="tiny" data-action="add-item" data-path="' + path + '">+ add ' + esc(label) + '</button></div>';
  }
  /* Editable checkable to-do list. */
  function todoList(path, items) {
    items = items || [];
    return '<ul class="list">' +
      items.map((t, i) => '<li class="' + (t.done ? 'done' : '') + '"><input type="checkbox" data-bind="' + path + '.' + i + '.done"' + (t.done ? ' checked' : '') + '>' +
        '<input type="text" data-bind="' + path + '.' + i + '.text" value="' + esc(t.text) + '">' +
        '<button type="button" class="tiny" data-action="remove-item" data-path="' + path + '" data-index="' + i + '" title="Remove">✕</button></li>').join('') +
      '</ul><div class="addrow"><button type="button" class="tiny" data-action="add-todo" data-path="' + path + '">+ add to-do</button></div>';
  }

  /* ------------------------------------------------------------------
     View: Overview
     ------------------------------------------------------------------ */
  function renderOverview() {
    const m = state.meta || {};
    const rank = ranked();
    const topByBucket = {};
    rank.forEach(r => { if (!topByBucket[r.b.id]) topByBucket[r.b.id] = r; });

    let html = '<h2 class="print-title">' + esc(m.title || 'Trip options') + ' — overview</h2>';
    html += '<section class="card hero"><h2 style="margin-top:0">' + esc(m.title || '') + '</h2><p class="muted">' + esc(m.tagline || '') + '</p>' +
      '<div class="cols"><div><h4>Travelers</h4><ul>' + (m.travelers || []).map(t => '<li>' + fmt(t) + '</li>').join('') + '</ul>' +
      '<p class="small"><b>Group:</b> ' + esc(m.groupSize || '') + ' · <b>Airports:</b> ' + esc(m.homeAirports || '') + '<br><b>Dates:</b> ' + esc(m.dates || '') + '</p></div>' +
      '<div><h4>Preferences we are scoring against</h4><ul>' + (m.preferences || []).map(t => '<li>' + fmt(t) + '</li>').join('') + '</ul></div></div></section>';

    html += '<h2>The four buckets</h2><div class="grid">';
    state.buckets.forEach(b => {
      const top = topByBucket[b.id];
      html += '<article class="card">' +
        '<h3>' + esc(b.name) + ' ' + badge(b.status) + '</h3>' +
        '<div class="row small"><span class="pill">' + esc(b.type) + '</span>' +
        '<span>Cost ' + dots(b.costTier) + '</span><span>Rail ' + dots(b.railScore) + '</span></div>' +
        '<p><b>Why:</b> ' + fmt(b.why) + '</p>' +
        '<p><b>Why not:</b> ' + fmt(b.whyNot) + '</p>' +
        (b.statusReason ? '<p class="small muted">Status: ' + fmt(b.statusReason) + '</p>' : '') +
        (top ? '<p class="small">Top sketch at current weights: <b>' + esc(top.so.name) + '</b> <span class="score">' + top.score.toFixed(2) + '</span></p>' : '') +
        ((b.subOptions || []).some(hasPlan) ? '<p class="small">' + planBadge() + ' ' + (b.subOptions || []).filter(hasPlan).map(so => esc(so.name)).join(' · ') + '</p>' : '') +
        '<p class="small"><a href="#detail/' + esc(b.id) + '">' + (b.subOptions || []).length + ' sub-options → detail</a></p>' +
        '</article>';
    });
    html += '</div>';

    html += '<h2>Ranking at current weights</h2><div class="card"><div class="tablewrap" style="border:0"><table class="compare" style="min-width:0"><thead><tr><th>#</th><th>Sketch</th><th>Bucket</th><th>Score</th><th>Status</th><th>Why (status reason)</th></tr></thead><tbody>';
    rank.forEach((r, i) => {
      html += '<tr><td class="num">' + (i + 1) + '</td><td class="name"><a href="#detail/' + esc(r.b.id) + '">' + esc(r.so.name) + '</a>' + (hasPlan(r.so) ? ' ' + planBadge() : '') + '</td><td>' + esc(r.b.name) + '</td><td class="num score">' + r.score.toFixed(2) + '</td><td>' + badge(r.so.status) + '</td><td style="white-space:normal">' + fmt(r.so.statusReason) + '</td></tr>';
    });
    html += '</tbody></table></div><p class="legend">Weights: ' + CRITERIA.map(c => c.label + ' ' + n(state.weights[c.key])).join(' · ') + ' — adjust on the Compare tab.</p></div>';

    /* Everything flagged "verify", grouped by bucket */
    html += '<h2>Needs verifying before anything is booked</h2><div class="card"><p class="small muted">Prices, flight schedules, seasonal opening dates and train timetables below are from general knowledge, not checked for 2027.</p>';
    state.buckets.forEach(b => {
      const rows = [];
      (b.subOptions || []).forEach(so => (so.verify || []).forEach(v => rows.push('<li>' + verifyTag() + ' ' + esc(v) + ' <span class="who">— ' + esc(so.name) + '</span></li>')));
      if (rows.length) html += '<h4>' + esc(b.name) + '</h4><ul class="verifylist">' + rows.join('') + '</ul>';
    });
    html += '</div>';
    return html;
  }

  /* ------------------------------------------------------------------
     View: Compare
     ------------------------------------------------------------------ */
  const COLUMNS = [
    { key: 'rank',    label: '#',           get: r => r.rank },
    { key: 'name',    label: 'Sketch',      get: r => r.so.name },
    { key: 'bucket',  label: 'Bucket',      get: r => r.b.name },
    { key: 'type',    label: 'Type',        get: r => r.so.type },
    { key: 'costTier',label: 'Cost tier',   get: r => n(r.so.costTier) },
    { key: 'flight',  label: 'Flight (h) / nonstop', get: r => n(r.so.flightHours) },
    { key: 'train',   label: 'Train leg',   get: r => r.so.train === 'yes' ? 2 : r.so.train === 'partial' ? 1 : 0 },
    { key: 'car',     label: 'Car',         get: r => ({ none: 2, optional: 1, needed: 0 })[r.so.car] ?? 0 },
    { key: 'rail',    label: 'Rail',        get: r => n(r.so.rail) },
    { key: 'kid3',    label: 'Kid 3',       get: r => n(r.so.kid3) },
    { key: 'kid7',    label: 'Kid 7',       get: r => n(r.so.kid7) },
    { key: 'scenery', label: 'Scenery',     get: r => n(r.so.scenery) },
    { key: 'history', label: 'History',     get: r => n(r.so.history) },
    { key: 'beach',   label: 'Beach',       get: r => ({ yes: 2, limited: 1, no: 0 })[r.so.beach] ?? 0 },
    { key: 'travel',  label: 'Travel score',get: r => travelScore(r.so) },
    { key: 'status',  label: 'Status',      get: r => STATUSES.indexOf(r.so.status) },
    { key: 'score',   label: 'Weighted',    get: r => r.score },
  ];

  function renderCompare() {
    const rows = ranked().map((r, i) => Object.assign(r, { rank: i + 1 }));
    const col = COLUMNS.find(c => c.key === ui.sort.key) || COLUMNS[COLUMNS.length - 1];
    rows.sort((a, b) => {
      const va = col.get(a), vb = col.get(b);
      const cmp = (typeof va === 'number' && typeof vb === 'number') ? va - vb : String(va).localeCompare(String(vb));
      return cmp * ui.sort.dir || a.rank - b.rank;
    });

    let html = '<h2 class="print-title">Compare — all sketches</h2>';
    html += '<section class="card"><h3>Weights <span class="muted small">(0 = ignore, 5 = dominant; rankings update live)</span></h3><div class="weights">';
    CRITERIA.forEach(c => {
      const w = n(state.weights[c.key]);
      html += '<div class="weight"><label for="w-' + c.key + '">' + esc(c.label) + '</label><span class="val" id="wv-' + c.key + '">' + w + '</span>' +
        '<input type="range" id="w-' + c.key + '" min="0" max="5" step="0.5" value="' + w + '" data-weight="' + c.key + '">' +
        (c.help ? '<span class="help">' + esc(c.help) + '</span>' : '') + '</div>';
    });
    html += '</div><div class="row" style="margin-top:.6rem"><button type="button" class="tiny no-print" data-action="reset-weights">Reset weights to defaults</button>' +
      '<span class="small muted">Score = Σ(weight × criterion) ÷ Σ(weights), on a 1–5 scale. Cost tier is shown but weighted near zero by default.</span></div></section>';

    html += '<h2>All sketches <span class="muted small">(click a header to sort)</span></h2><div class="tablewrap"><table class="compare"><thead><tr>';
    COLUMNS.forEach(c => {
      const sorted = c.key === ui.sort.key;
      html += '<th data-sort="' + c.key + '" class="' + (sorted ? 'sorted' : '') + '">' + esc(c.label) + (sorted ? '<span class="arrow">' + (ui.sort.dir > 0 ? '▲' : '▼') + '</span>' : '') + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows.forEach(r => {
      const so = r.so;
      const v = (so.verify || []).length;
      html += '<tr class="rank-' + r.rank + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td class="name"><a href="#detail/' + esc(r.b.id) + '">' + esc(so.name) + '</a>' + (hasPlan(so) ? ' ' + planBadge() : '') + (v ? ' <span class="tag verify" title="' + v + ' items to verify">' + v + '</span>' : '') + '<br><span class="small muted">' + esc(so.bases || '') + '</span></td>' +
        '<td>' + esc(r.b.name) + '</td>' +
        '<td>' + esc(so.type) + '</td>' +
        '<td class="num" title="1 cheap … 5 expensive">' + dots(so.costTier) + '</td>' +
        '<td class="num">' + n(so.flightHours) + 'h · ' + esc(so.direct) + '</td>' +
        '<td class="num">' + esc(so.train) + (so.train !== 'no' ? ' · ' + n(so.trainHours) + 'h' : '') + '</td>' +
        '<td class="num">' + esc(so.car) + '</td>' +
        '<td class="num">' + dots(so.rail) + '</td>' +
        '<td class="num">' + n(so.kid3) + '</td>' +
        '<td class="num">' + n(so.kid7) + '</td>' +
        '<td class="num">' + n(so.scenery) + '</td>' +
        '<td class="num">' + n(so.history) + '</td>' +
        '<td class="num" title="' + esc(so.beachHow) + '">' + esc(so.beach) + '</td>' +
        '<td class="num">' + travelScore(so).toFixed(1) + '</td>' +
        '<td>' + badge(so.status) + '</td>' +
        '<td class="num score score-cell">' + r.score.toFixed(2) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    html += '<p class="legend">Travel score: a missing nonstop now costs only −0.5 (−0.25 if seasonal) unless the sketch is flagged "connection costs a full day", per the 2026-10-03 flights decision. ';
    html += 'Flight hours are rough gate-to-gate from IAD to the gateway airport (nonstop or typical connection). Train leg = inter-base leg by rail. Rail score is the overall rail-friendliness used in scoring. Edit any value on the Detail tab.</p>';
    return html;
  }

  /* ------------------------------------------------------------------
     View: Detail (one bucket at a time)
     ------------------------------------------------------------------ */
  function renderDetail() {
    const bi = state.buckets.findIndex(b => b.id === ui.bucket);
    if (bi < 0) return '<p class="empty">No buckets. <button type="button" data-action="add-bucket">+ add bucket</button></p>';
    const b = state.buckets[bi];
    const P = 'buckets.' + bi;

    let html = '<div class="subnav no-print">' + state.buckets.map(x => '<a href="#detail/' + esc(x.id) + '" class="' + (x.id === b.id ? 'active' : '') + '">' + esc(x.name) + '</a>').join('') +
      '<button type="button" class="tiny" data-action="add-bucket">+ bucket</button></div>';

    html += '<section class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">' + esc(b.name) + ' ' + badge(b.status) + '</h2>' +
      '<button type="button" class="tiny danger no-print" data-action="remove-bucket" data-bucket="' + bi + '">remove bucket</button></div>' +
      '<div class="fields" style="margin-top:.8rem">' +
      field('Bucket name', P + '.name', b.name, 'text') +
      field('Region / type', P + '.type', b.type, 'select', { options: TYPES }) +
      field('Status', P + '.status', b.status, 'select', { options: STATUSES }) +
      field('Status reason', P + '.statusReason', b.statusReason, 'text') +
      field('Cost tier (1–5)', P + '.costTier', b.costTier, 'number', { min: 1, max: 5 }) +
      field('Rail score (1–5)', P + '.railScore', b.railScore, 'number', { min: 1, max: 5 }) +
      field('Why', P + '.why', b.why, 'textarea', { wide: true, rows: 2 }) +
      field('Why not', P + '.whyNot', b.whyNot, 'textarea', { wide: true, rows: 2 }) +
      field('Bucket notes (free text)', P + '.notes', b.notes, 'textarea', { wide: true, rows: 4 }) +
      '</div>' +
      '<div class="twocol" style="margin-top:1rem"><div><h4>Open questions</h4>' + stringList(P + '.openQuestions', b.openQuestions, 'question') + '</div>' +
      '<div><h4>Research to-dos</h4>' + todoList(P + '.todos', b.todos) + '</div></div></section>';

    html += '<h2>Itinerary sketches <span class="muted small">(' + (b.subOptions || []).length + ')</span> <button type="button" class="tiny no-print" data-action="add-sub" data-bucket="' + bi + '">+ add sub-option</button></h2>';
    (b.subOptions || []).forEach((so, si) => html += renderSubOption(b, bi, so, si));
    return html;
  }

  function renderSubOption(b, bi, so, si) {
    const P = 'buckets.' + bi + '.subOptions.' + si;
    const score = weightedScore(so);
    const isOpen = ui.open.has(so.id);
    return '<details class="sub" data-sub="' + esc(so.id) + '"' + (isOpen ? ' open' : '') + '>' +
      '<summary><span class="title">' + esc(so.name) + '</span>' + badge(so.status) +
      '<span class="meta">' + esc(so.bases || '') + '</span>' +
      '<span class="right"><span class="small muted">cost ' + dots(so.costTier) + ' · rail ' + dots(so.rail) + '</span><span class="score">' + score.toFixed(2) + '</span></span></summary>' +
      '<div class="body">' +
      '<div class="row" style="justify-content:flex-end;margin:.5rem 0"><button type="button" class="tiny danger no-print" data-action="remove-sub" data-bucket="' + bi + '" data-sub="' + si + '">remove sub-option</button></div>' +
      '<div class="fields">' +
      field('Name', P + '.name', so.name, 'text') +
      field('Bases / nights', P + '.bases', so.bases, 'text') +
      field('Type', P + '.type', so.type, 'select', { options: TYPES }) +
      field('Status', P + '.status', so.status, 'select', { options: STATUSES }) +
      field('Status reason', P + '.statusReason', so.statusReason, 'text') +
      field('Cost tier (1–5)', P + '.costTier', so.costTier, 'number', { min: 1, max: 5 }) +
      '</div>' +

      '<h4>Getting there and around</h4><div class="fields">' +
      field('Flight hours (IAD → gateway)', P + '.flightHours', so.flightHours, 'number', { min: 0, max: 24, step: 0.5 }) +
      field('Nonstop exists?', P + '.direct', so.direct, 'select', { options: ['yes', 'seasonal', 'no'] }) +
      field('Connection costs a full day?', P + '.connectionCostsDay', so.connectionCostsDay || 'no', 'select', { options: ['no', 'yes'] }) +
      field('Flight note', P + '.flightNote', so.flightNote, 'textarea', { wide: true, rows: 2 }) +
      field('Inter-base leg by train?', P + '.train', so.train, 'select', { options: ['yes', 'partial', 'no'] }) +
      field('Train hours', P + '.trainHours', so.trainHours, 'number', { min: 0, max: 24, step: 0.5 }) +
      field('Rail-friendliness (1–5, used in score)', P + '.rail', so.rail, 'number', { min: 1, max: 5 }) +
      field('Train note', P + '.trainNote', so.trainNote, 'textarea', { wide: true, rows: 2 }) +
      field('Car required', P + '.car', so.car, 'select', { options: ['none', 'optional', 'needed'] }) +
      field('Car note', P + '.carNote', so.carNote, 'textarea', { wide: true, rows: 2 }) +
      '</div>' +

      '<h4>Scores</h4><div class="fields">' +
      field('Kid appeal — 3 y.o. (1–5)', P + '.kid3', so.kid3, 'number', { min: 1, max: 5 }) +
      field('Kid appeal — 7 y.o. (1–5)', P + '.kid7', so.kid7, 'number', { min: 1, max: 5 }) +
      field('Scenery / towns (1–5)', P + '.scenery', so.scenery, 'number', { min: 1, max: 5 }) +
      field('History / novelty (1–5)', P + '.history', so.history, 'number', { min: 1, max: 5 }) +
      field('Beach day available?', P + '.beach', so.beach, 'select', { options: ['yes', 'limited', 'no'] }) +
      field('Beach — how', P + '.beachHow', so.beachHow, 'textarea', { wide: true, rows: 2 }) +
      '</div>' +

      '<h4>Lodging and weather</h4><div class="fields">' +
      field('Lodging style', P + '.lodgingStyle', so.lodgingStyle, 'textarea', { wide: true, rows: 2 }) +
      field('5 vs 7 people', P + '.lodging57', so.lodging57, 'textarea', { wide: true, rows: 2 }) +
      field('Expected May weather', P + '.weather', so.weather, 'textarea', { wide: true, rows: 2 }) +
      '</div>' +

      '<h4>Notes</h4><div class="fields">' +
      field('Notes (what is open in May, ideas, caveats)', P + '.notes', so.notes, 'textarea', { wide: true, rows: 6 }) +
      '</div>' +

      '<div class="twocol" style="margin-top:.6rem">' +
      '<div><h4>Open questions</h4>' + stringList(P + '.openQuestions', so.openQuestions, 'question') + '</div>' +
      '<div><h4>Research to-dos</h4>' + todoList(P + '.todos', so.todos) + '</div>' +
      (hasPlan(so) ? '' : '<div><h4>' + verifyTag() + ' Needs verification</h4>' + stringList(P + '.verify', so.verify, 'verify item') + '</div>') +
      '</div>' +
      renderPlan(so, P, bi, si) +
      '</div></details>';
  }

  /* The "Plan" section: only rendered when the sub-option has a `detail`
     block. Verify items live on the sub-option's main `verify` list (the
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
      '</section>';
  }

  /* ------------------------------------------------------------------
     View: Group questions
     ------------------------------------------------------------------ */
  function renderQuestions() {
    const qs = state.groupQuestions || [];
    const open = qs.filter(q => q.status !== 'decided').length;
    let html = '<h2 class="print-title">Group questions</h2>';
    html += '<div class="row" style="justify-content:space-between"><h2 style="margin-top:.4rem">Cross-cutting decisions <span class="muted small">' + open + ' open · ' + (qs.length - open) + ' decided</span></h2>' +
      '<button type="button" class="no-print" data-action="add-gq">+ add question</button></div>';
    if (!qs.length) html += '<p class="empty">No questions yet.</p>';
    qs.forEach((q, i) => {
      const P = 'groupQuestions.' + i;
      html += '<section class="card qcard">' +
        '<div class="qhead"><input type="checkbox" data-bind="' + P + '.status" data-truthy="decided" data-falsy="open" title="Mark decided"' + (q.status === 'decided' ? ' checked' : '') + '>' +
        '<textarea data-bind="' + P + '.text" rows="2">' + esc(q.text) + '</textarea>' +
        '<button type="button" class="tiny no-print" data-action="remove-item" data-path="groupQuestions" data-index="' + i + '" title="Remove">✕</button></div>' +
        '<div class="qmeta">' + badge(q.status || 'open') +
        '<input type="text" data-bind="' + P + '.answer" placeholder="Answer / decision…" value="' + esc(q.answer) + '">' +
        '<input type="text" data-bind="' + P + '.due" placeholder="decide by…" value="' + esc(q.due) + '">' +
        '<button type="button" class="tiny no-print" data-action="log-decision" data-index="' + i + '" title="Copy this decision into the log">→ log</button></div>' +
        '</section>';
    });
    return html;
  }

  /* ------------------------------------------------------------------
     View: Decision log
     ------------------------------------------------------------------ */
  function renderLog() {
    const log = (state.decisionLog || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    let html = '<h2 class="print-title">Decision log</h2>';
    html += '<div class="row" style="justify-content:space-between"><h2 style="margin-top:.4rem">Decision log <span class="muted small">newest first</span></h2><button type="button" class="no-print" data-action="add-log">+ add entry</button></div>';
    html += '<section class="card">';
    html += '<div class="logrow loghead"><span>Date</span><span>Ruled in / out</span><span>Reason</span><span></span></div>';
    if (!log.length) html += '<p class="empty">Nothing decided yet.</p>';
    log.forEach(e => {
      const i = state.decisionLog.indexOf(e);
      const P = 'decisionLog.' + i;
      html += '<div class="logrow">' +
        '<input type="date" data-bind="' + P + '.date" value="' + esc(e.date) + '">' +
        '<textarea data-bind="' + P + '.text" rows="2">' + esc(e.text) + '</textarea>' +
        '<textarea data-bind="' + P + '.reason" rows="2">' + esc(e.reason) + '</textarea>' +
        '<button type="button" class="tiny no-print" data-action="remove-item" data-path="decisionLog" data-index="' + i + '" title="Remove">✕</button></div>';
    });
    html += '</section>';
    return html;
  }

  /* ------------------------------------------------------------------
     Events — one listener each for click / input / change / toggle
     ------------------------------------------------------------------ */
  function coerce(el) {
    if (el.type === 'checkbox') {
      if (el.dataset.truthy !== undefined) return el.checked ? el.dataset.truthy : el.dataset.falsy;
      return el.checked;
    }
    if (el.type === 'number' || el.type === 'range') return el.value === '' ? '' : +el.value;
    return el.value;
  }

  /* Live typing: save without re-rendering (keeps focus). */
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.weight) {
      state.weights[el.dataset.weight] = +el.value;
      const v = $('#wv-' + el.dataset.weight);
      if (v) v.textContent = el.value;
      save();
      // Re-render only the table so the slider keeps focus.
      const tmp = document.createElement('div');
      tmp.innerHTML = renderCompare();
      const newTable = tmp.querySelector('.tablewrap');
      const oldTable = $('#app .tablewrap');
      if (newTable && oldTable) oldTable.replaceWith(newTable);
      return;
    }
    if (el.dataset.bind && (el.tagName === 'TEXTAREA' || el.type === 'text')) {
      setPath(state, el.dataset.bind, el.value);
      save();
    }
  });

  /* Committed edits: write, save, re-render. */
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'importFile') { if (el.files[0]) importJson(el.files[0]); el.value = ''; return; }
    if (el.dataset.weight) return; // handled on input
    if (!el.dataset.bind) return;
    setPath(state, el.dataset.bind, coerce(el));
    save();
    // Text fields were already saved on input; only re-render when the
    // change affects derived output (selects, numbers, checkboxes).
    if (el.tagName === 'SELECT' || el.type === 'number' || el.type === 'checkbox' || el.type === 'date') render();
  });

  document.addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (th) {
      const key = th.dataset.sort;
      if (ui.sort.key === key) ui.sort.dir *= -1;
      else ui.sort = { key, dir: ['name', 'bucket', 'type', 'rank', 'costTier', 'flight'].includes(key) ? 1 : -1 };
      render();
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset;
    switch (a.action) {
      case 'export': exportJson(); break;
      case 'import': $('#importFile').click(); break;
      case 'reset': resetDefaults(); break;
      case 'print': window.print(); break;
      case 'reset-weights':
        state.weights = deepClone(window.TRIP_DATA.weights); save(); render(); break;

      case 'add-item': {
        const arr = getPath(state, a.path) || [];
        arr.push('');
        setPath(state, a.path, arr);
        save(); render(); focusLast(a.path); break;
      }
      case 'add-todo': {
        const arr = getPath(state, a.path) || [];
        arr.push({ text: '', done: false });
        setPath(state, a.path, arr);
        save(); render(); focusLast(a.path); break;
      }
      case 'remove-item': {
        const arr = getPath(state, a.path);
        if (!arr) break;
        const item = arr[+a.index];
        const label = typeof item === 'string' ? item : (item && (item.text || item.name)) || '';
        if (label && !confirm('Remove "' + label.slice(0, 80) + '"?')) break;
        arr.splice(+a.index, 1);
        save(); render(); break;
      }
      case 'add-sub': {
        const b = state.buckets[+a.bucket];
        const so = blankSubOption();
        (b.subOptions = b.subOptions || []).push(so);
        ui.open.add(so.id);
        save(); render(); break;
      }
      case 'remove-sub': {
        const b = state.buckets[+a.bucket];
        const so = b.subOptions[+a.sub];
        if (!confirm('Remove sub-option "' + so.name + '"?')) break;
        b.subOptions.splice(+a.sub, 1);
        save(); render(); break;
      }
      case 'add-plan': {
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
      case 'add-bucket': {
        const name = prompt('Bucket name?', 'New bucket');
        if (!name) break;
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid('bucket');
        state.buckets.push({ id, name, type: 'mixed', costTier: 3, railScore: 3, status: 'idea', statusReason: '', why: '', whyNot: '', notes: '', openQuestions: [], todos: [], subOptions: [] });
        save(); location.hash = '#detail/' + id; render(); break;
      }
      case 'remove-bucket': {
        const b = state.buckets[+a.bucket];
        if (!confirm('Remove the whole bucket "' + b.name + '" and its ' + (b.subOptions || []).length + ' sub-options?')) break;
        state.buckets.splice(+a.bucket, 1);
        ui.bucket = null;
        save(); location.hash = '#detail'; render(); break;
      }
      case 'add-gq':
        (state.groupQuestions = state.groupQuestions || []).push({ id: uid('gq'), text: '', status: 'open', answer: '', due: '' });
        save(); render(); focusLast('groupQuestions'); break;
      case 'add-log':
        (state.decisionLog = state.decisionLog || []).push({ id: uid('log'), date: today(), text: '', reason: '' });
        save(); render(); break;
      case 'log-decision': {
        const q = state.groupQuestions[+a.index];
        (state.decisionLog = state.decisionLog || []).push({ id: uid('log'), date: today(), text: q.text, reason: q.answer || '' });
        q.status = 'decided';
        save(); render(); flash('Added to decision log'); break;
      }
    }
  });

  /* Remember which sub-option panels are open across re-renders. */
  document.addEventListener('toggle', e => {
    const d = e.target;
    if (d.matches && d.matches('details.sub')) {
      if (d.open) ui.open.add(d.dataset.sub); else ui.open.delete(d.dataset.sub);
    }
  }, true);

  window.addEventListener('hashchange', render);

  function focusLast(path) {
    const inputs = document.querySelectorAll('[data-bind^="' + path + '."]');
    const last = inputs[inputs.length - 1];
    if (last) { const t = last.closest('li, .qcard'); const inp = t ? t.querySelector('input[type=text], textarea') : last; (inp || last).focus(); }
  }

  function blankSubOption() {
    return {
      id: uid('sub'), name: 'New sketch', bases: '', type: 'city', costTier: 3,
      flightHours: 8, direct: 'yes', connectionCostsDay: 'no', flightNote: '', train: 'yes', trainHours: 2, trainNote: '',
      car: 'none', carNote: '', rail: 3, kid3: 3, kid7: 3, scenery: 3, history: 3,
      beach: 'no', beachHow: '', lodgingStyle: '', lodging57: '', weather: '', notes: '',
      openQuestions: [], todos: [], verify: [], status: 'idea', statusReason: '',
    };
  }

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  if (!window.TRIP_DATA) {
    document.body.innerHTML = '<p style="padding:2rem">data.js did not load. Make sure it sits next to index.html.</p>';
    return;
  }
  state = load();
  render();
})();
