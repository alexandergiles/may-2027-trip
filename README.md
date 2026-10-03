# May 2027 trip planner

A local, single-folder website for comparing and shaping destination options for a 7–10 day family trip in May 2027. Plain HTML, CSS and vanilla JavaScript. No frameworks, no build step, no server.

## Files

| File | What it is |
|---|---|
| `index.html`, `shortlist.css`, `shortlist.js` | **Landing page**: the read-only, photo-led shortlist for the family (top ten sketches with plans). Reads the same data as the planner, plus your saved edits. |
| `planner.html` | The editable planner: header, tabs, toolbar, and an empty `<main>` that `app.js` fills. |
| `styles.css` | All styling, including the mobile layout and the print stylesheet. |
| `app.js` | Rendering, scoring, editing, localStorage persistence, export/import. |
| `data.js` | **All default content** (buckets, sub-options, group questions, decision log, default weights). Assigns `window.TRIP_DATA`. |
| `images.js`, `img/` | Photos for the shortlist page (downloaded from Wikimedia Commons; captions, credits and licences in `images.js`). |
| `README.md` | This file. |

## How to open

Double-click `index.html` for the shortlist or `planner.html` for the editable planner. Both run from `file://` with no server. Nothing is fetched; `data.js` is loaded as a plain script, which is why the content lives in a `.js` file instead of a `.json` file (browsers block `fetch()` of local files).

Tested paths: Chrome, Safari, Firefox on macOS. The whole folder is published unchanged via GitHub Pages at **https://alexandergiles.github.io/may-2027-trip/** (repo: github.com/alexandergiles/may-2027-trip). Push to `main` and the site updates within a minute or two.

## Planner views (`planner.html`)

- **Overview** — the four buckets as cards (status, cost tier, rail score, why / why not), the full ranking at current weights, and every item tagged "verify".
- **Compare** — a sortable grid of all sub-options with weight sliders. Rankings update as you drag. Click a column header to sort; click again to flip.
- **Detail** — one bucket at a time. Everything is editable inline: bucket fields, open questions, checkable research to-dos, notes, and every field of every sub-option. Add or remove sub-options and buckets here. Sketches with a `detail` block show a **Plan** section (Arrival, Lodging, 7 nights, 10 nights, Anchors for kids and adults, May week, Verify) and a purple **Has plan** badge here, on the Overview, and in the Compare grid. Any sketch can get a plan with the "+ add a day-by-day plan" button.
- **Group questions** — cross-cutting decisions with an open/decided checkbox, an answer field and a "decide by" field. The **→ log** button copies a decision into the decision log and marks it decided.
- **Decision log** — dated entries for anything ruled in or out, newest first.

## The shortlist page

`index.html` is the page to send the family (it is also the landing page of the published site). It shows every sketch that has a `detail` block, ranked by the planner's weighted score, top ten: hero photo, at-a-glance cards, facts, arrival and lodging, the day-by-day plan with a photo per day, 10-night extensions, anchors for kids and adults, the May-week note, a photo gallery with lightbox, and collapsed open-questions and verify lists. It reads the planner's saved edits from localStorage when they exist, so changes made on `planner.html` in the same browser show up on reload.

Photos live in `img/` and are listed in `images.js` (`window.TRIP_IMAGES`): one entry per photo with `sketch` (sub-option id), `file`, `caption`, and Commons `title`, `artist`, `license`, `page`. A caption that ends in "— day N" attaches the photo to day N of the plan. To add a photo, drop a JPEG in `img/` and add an entry. Photos were fetched by keyword from Wikimedia Commons and eyeballed, not curated by hand — swap any that miss.

## Scoring

Each sub-option gets a weighted score on a 1–5 scale:

```
score = Σ (weight × criterion) ÷ Σ weights
```

| Criterion | How it is derived from the sub-option fields |
|---|---|
| Rail-friendliness | the `rail` field (1–5) |
| Kid appeal | average of `kid3` and `kid7` |
| Scenery / towns | `scenery` |
| History / novelty | `history` |
| Travel time | from `flightHours` (≤7.5h → 5, ≤8.5h → 4, ≤10h → 3, else 2). A missing nonstop costs −0.5 (`direct: no`) or −0.25 (`seasonal`). If `connectionCostsDay` is `yes` the full −1.5 applies instead. This follows the 2026-10-03 decision that connections are fine when they land us at base 1 the same day. |
| Beach day | `beach`: yes → 5, limited → 3, no → 1 |
| Cost | `6 − costTier` (cheaper scores higher) |

Default weights (editable on the Compare tab, stored with your data): rail 5, kid appeal 4, scenery 4, history 4, travel time 2.5, beach 2, cost 0.5. Cost is deliberately near zero — it is a tiebreaker, not a constraint.

## Saving, export and import

- Every edit is saved automatically to this browser's **localStorage**. Nothing leaves your machine.
- **Export JSON** downloads the complete current state (content, weights, questions, log) as `may-2027-trip-YYYY-MM-DD.json`. Do this to back up, to move to another computer, or to share with family.
- **Import JSON** loads a previously exported file and replaces the current state.
- **Reset to defaults** throws away browser edits and reloads `data.js`.

Because saved edits take priority over `data.js`, **hand edits to `data.js` normally only appear after Reset to defaults** (or in a browser that has never opened the site). Export first if you want to keep browser edits, then merge by hand or re-import.

**Exception: bumping `version`.** If you raise the `version` number at the top of `data.js`, the app merges the new defaults into the saved copy on next load without touching anything you typed: new buckets, sub-options, questions and log entries are added by id; a sub-option that gains a `detail` block also takes the new verify items and status; a group question whose saved answer is empty takes the new answer. This is how the 2026-10-03 update (version 2) reached browsers that had already opened the site.

## Editing `data.js` by hand

`data.js` is a normal JavaScript object with comments. The field reference is at the top of the file. Rules of thumb:

- Scores are 1–5. Cost tier: 1 = cheap … 5 = Switzerland.
- Put the literal token `[verify]` anywhere in a text field and the UI renders a yellow **verify** tag. The per-sub-option `verify` array is the canonical list of things to check; the Overview collects all of them.
- Keep `id` values unique within their array. The Detail tab uses bucket ids in the URL hash (`#detail/alps`).

### Adding a bucket

1. Copy one of the objects inside the `buckets` array.
2. Give it a new unique `id` (lowercase, hyphens) and `name`.
3. Fill in `type`, `costTier`, `railScore`, `status`, `statusReason`, `why`, `whyNot`.
4. Add `subOptions` by copying an existing sub-option object; every sub-option needs the numeric fields (`costTier`, `flightHours`, `rail`, `kid3`, `kid7`, `scenery`, `history`) for the Compare grid.
5. Save, open the site, click **Reset to defaults**.

You can also add a bucket in the browser with the **+ bucket** button on the Detail tab, then Export JSON if you want a file copy.

### Adding a day-by-day plan (`detail`)

A sub-option may carry an optional `detail` object:

```js
detail: {
  arrival: "...",            // how we land and get to base 1
  lodging: "...",            // what works for 5 vs 7, evening space for the adults
  days7: ["D1 ...", "D2 ..."],   // numbered 7-night plan
  days10: ["...", "..."],        // 10-night version or extensions
  anchorsKids: "...",
  anchorsAdults: "...",
  mayWeek: "...",            // which May week and what it changes
  verify: ["..."],           // kept for the record; merged into the sub-option's own `verify` list
}
```

The UI edits the sub-option's top-level `verify` list, not `detail.verify`. When adding a plan by hand, copy any new verify items into the top-level list too (the merge script that produced version 2 did this and removed duplicates).

### Adding a sub-option, question or to-do

Same idea: copy an existing one in `data.js`, or use the **+ add** buttons in the browser.

## Printing

Use the **Print** button (or ⌘P). The current view prints in landscape; buttons, sliders and navigation are hidden. Overview and Compare are the views designed for paper.
