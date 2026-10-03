# tools/ — one-off scripts used to build the site (kept for reruns)

Run everything from the project root (`cd ~/projects/may-2027-trip`).

| File | What it does |
|---|---|
| `fetch_images.py` | Searches Wikimedia Commons for each entry in its `WANT` list (sketch id, slug, query, caption), downloads the best JPEG to `img/<slug>.jpg`, and records title/author/licence in `manifest.json`. Skips slugs already fetched; `=other-slug` reuses an existing photo. Paces requests and retries on HTTP 429. |
| `finalize_images.py` | Downsizes every photo in `manifest.json` to 1400px wide and writes `images.js` (sorted by sketch). Run after any fetch. |
| `manifest.json` | The fetched-photo record that `finalize_images.py` reads. Edit a caption here, rerun finalize, and `images.js` updates. |
| `plans2.json` | The day-by-day plans for sketches 6–10 as merged into `data.js`. The first five came from `../sketch-details.json`. |
| `merge.js`, `merge2.js` | Text-insertion merges of plan JSON into `data.js` (keep comments intact). Already applied; kept as examples. |
| `patch-app.js` | The 2026-10-03 patch that added the Plan section, Has-plan badge, migration and scoring change to `app.js`. Already applied. |

To replace a photo: delete `img/<slug>.jpg`, remove its entry from `manifest.json`, change the query in `fetch_images.py`, then run `python3 tools/fetch_images.py && python3 tools/finalize_images.py`.
