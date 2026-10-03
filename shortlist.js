/* =====================================================================
   shortlist.js — renders index.html (the public landing page), the
   read-only page for the family to browse the top sketches.

   Sources
   - data.js (window.TRIP_DATA), or the planner's saved edits in
     localStorage if this browser has any — so edits made on planner.html
     show up here too.
   - images.js (window.TRIP_IMAGES): downloaded Wikimedia Commons images
     keyed by sketch id. A caption ending in "— day N" attaches the image
     to day N of the day-by-day plan.

   Which sketches appear: every sub-option that has a `detail` block,
   ranked by the planner's weighted score at the saved weights, top 10.
   ===================================================================== */
(function () {
  'use strict';

  const STORAGE_KEY = 'may2027-trip-planner-v1'; // same key as app.js
  const MAX = 10;

  /* Accent color per sketch id (falls back through the palette). */
  const COLORS = {
    'lisbon-porto': '#c2552b',
    'london-highlands-rail': '#2f6b4f',
    'swiss-lucerne-bo': '#b3261e',
    'bavaria-munich-garmisch': '#2b5fa8',
    'berlin-dresden-prague': '#3d5a6c',
    'seville-granada': '#b8742a',
    'barcelona-girona': '#8a3b5c',
    'london-edinburgh': '#1f5f8b',
    'lisbon-algarve': '#1b8a8a',
    'austria-salzburg': '#6b4fa0',
  };
  const PALETTE = ['#c2552b', '#2f6b4f', '#b3261e', '#2b5fa8', '#3d5a6c', '#7a4e9c'];

  /* ---------- data ---------- */
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        // A saved copy older than data.js is ignored until planner.html migrates it.
        if (p && Array.isArray(p.buckets) && +p.version >= +window.TRIP_DATA.version) return p;
      }
    } catch (e) { /* fall through */ }
    return window.TRIP_DATA;
  }
  const state = loadState();
  const IMAGES = window.TRIP_IMAGES || [];

  /* ---------- scoring: same formulas as app.js ---------- */
  const n = v => (v === '' || v == null || isNaN(+v)) ? 0 : +v;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function travelScore(so) {
    const h = n(so.flightHours);
    let s = h <= 7.5 ? 5 : h <= 8.5 ? 4 : h <= 10 ? 3 : 2;
    if (so.direct !== 'yes') s -= so.connectionCostsDay === 'yes' ? 1.5 : (so.direct === 'no' ? 0.5 : 0.25);
    return clamp(s, 1, 5);
  }
  const CRIT = {
    rail: so => n(so.rail),
    kid: so => (n(so.kid3) + n(so.kid7)) / 2,
    scenery: so => n(so.scenery),
    history: so => n(so.history),
    travel: travelScore,
    beach: so => ({ yes: 5, limited: 3, no: 1 })[so.beach] || 1,
    cost: so => 6 - clamp(n(so.costTier), 1, 5),
  };
  function weightedScore(so) {
    const w = state.weights || window.TRIP_DATA.weights;
    let num = 0, den = 0;
    Object.keys(CRIT).forEach(k => { num += n(w[k]) * CRIT[k](so); den += n(w[k]); });
    return den ? num / den : 0;
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const fmt = s => esc(s).replace(/\[verify\]/gi, '<span class="tag verify">verify</span>');
  const pct = v => Math.round(clamp(n(v), 0, 5) / 5 * 100);
  const bar = v => '<span class="bar"><i style="width:' + pct(v) + '%"></i></span>';
  const meter = (label, v) => '<div class="meter"><span>' + esc(label) + '</span>' + bar(v) + '<span class="v">' + (Math.round(n(v) * 10) / 10) + '</span></div>';
  const imagesFor = id => IMAGES.filter(i => i.sketch === id);
  const dayOf = img => { const m = /day\s+(\d+)/i.exec(img.caption || ''); return m ? +m[1] : null; };
  /* Bold the leading "D3" token of a plan line. */
  function dayText(t) {
    const m = /^D(\d+)\s+(.*)$/s.exec(t);
    return m ? fmt(m[2]) : fmt(t);
  }
  const trainWord = so => so.train === 'yes' ? 'Yes' : so.train === 'partial' ? 'Partly' : 'No';
  const carWord = so => ({ none: 'None needed', optional: 'Optional', needed: 'Needed' })[so.car] || so.car;
  const directWord = so => ({ yes: 'nonstop', seasonal: 'seasonal nonstop', no: 'one connection' })[so.direct] || so.direct;
  const costWord = t => ['', '$', '$$', '$$$', '$$$$', '$$$$$'][clamp(Math.round(n(t)), 1, 5)];

  /* ---------- pick the sketches ---------- */
  const picks = [];
  (state.buckets || []).forEach(b => (b.subOptions || []).forEach(so => {
    if (so.detail) picks.push({ b, so, score: weightedScore(so) });
  }));
  picks.sort((a, b) => b.score - a.score);
  const top = picks.slice(0, MAX);
  top.forEach((p, i) => { p.rank = i + 1; p.color = COLORS[p.so.id] || PALETTE[i % PALETTE.length]; p.imgs = imagesFor(p.so.id); p.hero = p.imgs[0]; });

  /* ---------- render ---------- */
  function renderHero() {
    const m = state.meta || {};
    const strip = top.map(p => p.hero ? '<img src="' + esc(p.hero.file) + '" alt="">' : '<div></div>').join('');
    return '<header class="hero"><div class="strip">' + strip + '</div><div class="overlay"><div class="wrap">' +
      '<div class="kicker">May 2027 · 7–10 nights · ' + esc(m.groupSize || '5 or 7') + ' of us</div>' +
      '<h1>The shortlist</h1>' +
      '<p class="lede">' + top.length + ' itineraries drawn up day by day, each built around two bases joined by train — the top ten of sixteen sketches. Scroll through, argue, and mark what you like in the planner.</p>' +
      '<div class="chips">' + (m.travelers || []).map(t => '<span class="chip">' + esc(t) + '</span>').join('') + '</div>' +
      '</div></div></header>';
  }

  function renderNav() {
    return '<nav class="subnav"><div class="wrap">' +
      top.map(p => '<a href="#' + esc(p.so.id) + '" style="--c:' + p.color + '"><span class="n">' + p.rank + '</span>' + esc(shortName(p.so)) + '</a>').join('') +
      '<a class="back" href="planner.html">Planner →</a></div></nav>';
  }
  function shortName(so) { return so.name.replace(/^[^:]+:\s*/, '').replace(/\s*\(.*\)$/, ''); }

  function renderGlance() {
    return '<section class="glance"><div class="wrap">' +
      '<h2>At a glance</h2><p class="intro muted">The top ten of sixteen sketches, ranked by the planner\'s weighted score (rail, kid appeal, scenery and history weigh most; cost is a tiebreaker). Scores run 1–5 and the spread is narrow on purpose — the choice is about taste, dates and headcount, not arithmetic.</p>' +
      '<div class="cards">' + top.map(p => {
        const so = p.so;
        return '<a class="card" href="#' + esc(so.id) + '" style="--c:' + p.color + '">' +
          (p.hero ? '<img src="' + esc(p.hero.file) + '" alt="" loading="lazy">' : '') +
          '<div class="body"><span class="rank">#' + p.rank + ' <span class="score">' + p.score.toFixed(2) + '</span></span>' +
          '<h3>' + esc(so.name) + '</h3><div class="bases">' + esc(so.bases || '') + '</div>' +
          '<div class="facts"><span><b>✈</b> ' + n(so.flightHours) + 'h, ' + esc(directWord(so)) + '</span><span><b>🚆</b> ' + esc(trainWord(so)) + (so.train !== 'no' ? ', ' + n(so.trainHours) + 'h' : '') + '</span>' +
          '<span><b>🚗</b> ' + esc(carWord(so)) + '</span><span><b>Cost</b> ' + costWord(so.costTier) + '</span>' +
          '<span><b>Kids</b> ' + n(so.kid3) + ' / ' + n(so.kid7) + '</span><span><b>Scenery</b> ' + n(so.scenery) + ' · <b>History</b> ' + n(so.history) + '</span></div>' +
          '</div></a>';
      }).join('') + '</div></div></section>';
  }

  function renderSketch(p) {
    const so = p.so, b = p.b, d = so.detail || {};
    /* Choose the day list that is actually day-by-day (the Highlands
       sketch keeps its 7-night version as a single note). */
    const useTen = (d.days7 || []).length < 4 && (d.days10 || []).length >= 4;
    const dayList = useTen ? d.days10 : (d.days7 || []);
    const otherList = useTen ? d.days7 : (d.days10 || []);
    const byDay = {}; p.imgs.forEach(img => { const k = dayOf(img); if (k && !byDay[k]) byDay[k] = img; });

    const dayItems = dayList.map((t, i) => {
      const dnum = i + 1, img = byDay[dnum];
      const nights = dnum === dayList.length ? 'home' : 'day';
      return '<li class="day' + (img ? '' : ' noimg') + '"><div class="d">' + dnum + '<small>' + nights + '</small></div><div class="t">' + dayText(t) + '</div>' +
        (img ? '<img src="' + esc(img.file) + '" alt="" loading="lazy" data-full="' + esc(img.file) + '" data-cap="' + esc(img.caption) + '">' : '') + '</li>';
    }).join('');

    return '<section class="sketch" id="' + esc(so.id) + '" style="--c:' + p.color + '"><div class="wrap">' +
      '<div class="head"><div>' +
        '<div class="num">' + p.rank + '</div><h2>' + esc(so.name) + '</h2><div class="bases">' + esc(so.bases || '') + '</div>' +
        '<div class="score-line"><span class="big">' + p.score.toFixed(2) + '</span><span class="muted small">weighted score · ' + esc(b.name) + '</span></div>' +
        '<div><span class="pill">✈ <b>' + n(so.flightHours) + 'h</b> ' + esc(directWord(so)) + '</span><span class="pill">🚆 train leg <b>' + esc(trainWord(so).toLowerCase()) + '</b>' + (so.train !== 'no' ? ' ~' + n(so.trainHours) + 'h' : '') + '</span><span class="pill">🚗 <b>' + esc(carWord(so).toLowerCase()) + '</b></span><span class="pill">cost <b>' + costWord(so.costTier) + '</b></span><span class="pill">beach day <b>' + esc(so.beach) + '</b></span></div>' +
        '<p class="why">' + fmt(so.statusReason ? so.statusReason.replace(/^Shortlisted [\d-]+ with a detailed plan \(see Plan below\)\.\s*/, '') : b.why) + '</p>' +
        '<div style="display:grid;gap:.35rem;max-width:26rem">' + meter('Rail-friendliness', so.rail) + meter('Kids (3 / 7)', (n(so.kid3) + n(so.kid7)) / 2) + meter('Scenery / towns', so.scenery) + meter('History / novelty', so.history) + meter('Travel time', travelScore(so)) + '</div>' +
      '</div>' +
      (p.hero ? '<div class="pic"><img src="' + esc(p.hero.file) + '" alt="" data-full="' + esc(p.hero.file) + '" data-cap="' + esc(p.hero.caption) + '"></div>' : '') +
      '</div>' +

      '<div class="facts-grid">' +
        '<div class="fact"><span class="k">Flights</span>' + fmt(so.flightNote) + '</div>' +
        '<div class="fact"><span class="k">The train leg</span>' + fmt(so.trainNote) + '</div>' +
        '<div class="fact"><span class="k">Car</span>' + fmt(so.carNote) + '</div>' +
        '<div class="fact"><span class="k">May weather</span>' + fmt(so.weather) + '</div>' +
        '<div class="fact"><span class="k">Beach day</span>' + fmt(so.beachHow) + '</div>' +
        '<div class="fact"><span class="k">5 vs 7 people</span>' + fmt(so.lodging57) + '</div>' +
      '</div>' +

      '<h4>Getting there and sleeping</h4><div class="two">' +
        '<div class="panel"><h3>✈ Arrival</h3><p>' + fmt(d.arrival) + '</p></div>' +
        '<div class="panel"><h3>🛏 Lodging</h3><p>' + fmt(d.lodging) + '</p><p class="small muted">Rule we agreed: any format works as long as the adults get a shared living space once the kids are down.</p></div>' +
      '</div>' +

      '<h4>' + (useTen ? '10 nights, day by day' : '7 nights, day by day') + '</h4>' +
      '<ol class="days">' + dayItems + '</ol>' +
      (otherList && otherList.length ? '<h4>' + (useTen ? 'With only 7 nights' : 'With 10 nights') + '</h4><div class="panel"><ul class="ext">' + otherList.map(t => '<li>' + fmt(t) + '</li>').join('') + '</ul></div>' : '') +

      '<h4>Anchors</h4><div class="anchors">' +
        '<div class="panel"><h3>🧒 For the kids</h3><p>' + fmt(d.anchorsKids) + '</p></div>' +
        '<div class="panel"><h3>🧭 For the adults</h3><p>' + fmt(d.anchorsAdults) + '</p></div>' +
      '</div>' +

      '<h4>Which week in May</h4><div class="callout">' + fmt(d.mayWeek) + '</div>' +

      (p.imgs.length ? '<h4>Pictures — day trips and anchors</h4><div class="gallery">' + p.imgs.map(img =>
        '<figure data-full="' + esc(img.file) + '" data-cap="' + esc(img.caption) + '"><img src="' + esc(img.file) + '" alt="' + esc(img.caption) + '" loading="lazy"><figcaption>' + esc(img.caption) + '</figcaption></figure>').join('') + '</div>' : '') +

      ((so.openQuestions || []).length ? '<details class="more"><summary>Open questions (' + so.openQuestions.length + ')</summary><ul>' + so.openQuestions.map(q => '<li>' + fmt(q) + '</li>').join('') + '</ul></details>' : '') +
      ((so.verify || []).length ? '<details class="more"><summary>Still to verify before booking (' + so.verify.length + ')</summary><ul>' + so.verify.map(v => '<li><span class="tag verify">verify</span> ' + esc(v) + '</li>').join('') + '</ul></details>' : '') +
      '</div></section>';
  }

  function renderFooter() {
    const used = top.flatMap(p => p.imgs);
    return '<footer class="foot"><div class="wrap">' +
      '<p>Built from the family planner (<a href="planner.html">planner.html</a>). Flight times, train hours and opening dates are general knowledge, not checked for 2027 — anything marked <span class="tag verify">verify</span> needs a look before booking.</p>' +
      '<details><summary>Image credits (' + used.length + ' photos from Wikimedia Commons)</summary><ul>' +
      used.map(i => '<li><a href="' + esc(i.page) + '">' + esc(i.title.replace(/^File:/, '')) + '</a>' + (i.artist ? ' — ' + esc(i.artist) : '') + (i.license ? ' (' + esc(i.license) + ')' : '') + '</li>').join('') +
      '</ul></details></div></footer>';
  }

  const page = document.getElementById('page');
  if (!top.length) {
    page.innerHTML = '<div class="wrap" style="padding:3rem 1.2rem"><h1>No shortlisted sketches</h1><p>Add a day-by-day plan to a sketch in the <a href="planner.html">planner</a> and it will appear here.</p></div>';
    return;
  }
  page.innerHTML = renderHero() + renderNav() + renderGlance() + top.map(renderSketch).join('') + renderFooter();

  /* ---------- lightbox ---------- */
  const lb = document.getElementById('lightbox'), lbImg = document.getElementById('lightboxImg'), lbCap = document.getElementById('lightboxCap');
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-full]');
    if (t && lb && lb.showModal) {
      lbImg.src = t.dataset.full; lbCap.textContent = t.dataset.cap || '';
      lb.showModal();
      e.preventDefault();
    } else if (e.target === lb || e.target === lbImg) {
      lb.close();
    }
  });
})();
