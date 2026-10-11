# Leading Economic Index Dashboard — Design Spec

**Date:** 2026-10-11
**Status:** Approved for planning

## 1. Purpose

A public-facing web dashboard presenting the Conference Board's **Leading Economic
Index (LEI)** and its 10 components as dynamic, interactive charts. Each chart
includes historical values, a forward-looking "analyst expectation" where one
genuinely exists, and a linked explanation of what the indicator measures and
what it's used to predict. Runs as a self-hosted Docker container.

## 2. Goals / Non-goals

**Goals:**
- Show historical time series for the 10 official LEI components (or the closest
  free proxy where the official series is proprietary).
- Show the official Conference Board LEI headline value (index level + MoM %
  change), manually curated from their free monthly press release.
- Where a genuine, sourced forward-looking value exists, show it. Where it
  doesn't, say so honestly rather than fabricating a number.
- Every indicator links to a plain-language description: what it measures,
  what it's historically used to predict/signal, and its original source.
- Runs as a single Docker container, self-hosted, long-running.
- Data refreshes automatically on a schedule; the app never makes live
  upstream API calls in the request path.

**Non-goals:**
- Replicating the Conference Board's exact proprietary LEI composite
  methodology (the weighting/compositing is licensed IP — out of reach for a
  free dashboard).
- Full historical back-fill correctness-auditing against the official LEI
  publication — we're building a dashboard inspired by the LEI framework
  using free government data, not a certified replica.
- Multi-tenant auth, user accounts, or saved views — single public read-only
  surface for v1.
- Non-US indicators.

## 3. Scope: the 10 components + headline

| # | Component | Source | Status |
|---|---|---|---|
| 1 | Average weekly hours, manufacturing | FRED `AWHMAN` | Live, direct |
| 2 | Average weekly initial jobless claims | FRED `ICSA` | Live, direct |
| 3 | New orders, consumer goods and materials | FRED `ACOGNO` (consumer goods only). Confirmed via the Conference Board's own [Feb 2026 LEI Technical Notes](https://www.conference-board.org/pdf_free/press/US%20LEI%20Technical%20Notes-Feb%202026.pdf): this component is explicitly footnoted as "based on our estimates" — i.e. not a pass-through of any single public Census series, so there is no free series to fully replicate, only the closest available input | Live, **partial proxy (confirmed final)** |
| 4 | ISM Index of New Orders | No free API (ISM licenses the data series; only the monthly headline commentary is free) | **Manual proxy** — entered monthly from ISM's free press release, labeled as manually curated |
| 5 | New orders, nondefense capital goods ex-aircraft | FRED `NEWORDER` | Live, direct |
| 6 | Building permits, new private housing | FRED `PERMIT` | Live, direct |
| 7 | S&P 500 | FRED `SP500` | Live, direct |
| 8 | Leading Credit Index | Proprietary, no free equivalent | **Substitute proxy**: Chicago Fed National Financial Conditions Index, FRED `NFCI` — labeled clearly as a substitute, not the official LCI |
| 9 | Interest rate spread (10yr Treasury − Fed funds) | FRED `T10YFF` | Live, direct |
| 10 | Consumer expectations | FRED `UMCSENT` (overall Michigan Sentiment index). Confirmed via FRED's own search catalog: no series titled "Index of Consumer Expectations" exists on FRED — `UMCSENT` is the only University of Michigan survey series FRED carries, so it's the final answer, not a fallback pending verification | Live, **partial proxy (confirmed final)** |
| — | **Official LEI headline** (index level + MoM % change) | Conference Board monthly press release (free, not an API) | **Manual entry**, monthly |

Every proxy/substitute is labeled as such in the UI, not presented as the
official component.

**Display frequency:** each indicator is plotted at its own native reporting
frequency (daily for `SP500`/`T10YFF`, weekly for `ICSA`, monthly for the
rest) — v1 does not aggregate high-frequency series to a synthetic monthly
value for cross-card comparison. This is an explicit decision, not an
oversight: the official LEI methodology monthly-averages the daily/weekly
inputs to build its composite, but since v1 doesn't compute that composite
(see Non-goals), there's no composite to feed a monthly average into. Each
card's chart is self-contained.

**Directional polarity:** some components are counter-cyclical — a *rising*
value signals *worsening*, not improving, conditions. `ICSA` (initial
jobless claims) and the `NFCI` proxy for the Leading Credit Index (#8) are
both inverted in this sense. Each indicator's metadata carries an
`inverted` flag (§6); the UI uses it to add a visible "higher = weaker"
annotation and an inverted-sense color cue, so a casual reader doesn't read
rising claims as good news.

## 4. Analyst predictions: realistic coverage

Individual LEI components are inputs to forecasting, not targets of published
consensus forecasts. Only two of the eleven series above can carry a
genuine, sourced forward-looking value in v1:

- **Interest rate spread (#9):** computed from two independent free,
  citable sources — the Fed's Summary of Economic Projections (fed funds
  rate path) and the Philadelphia Fed's Survey of Professional Forecasters
  (10-year Treasury yield median forecast). These two surveys publish on
  different quarterly calendars (SEP: Mar/Jun/Sep/Dec; SPF: Feb/May/Aug/Nov)
  and don't automatically line up. **Horizon-matching rule:** use each
  survey's forecast for the same target calendar year-end (e.g. both
  series' "end of 2026" projection), and record the `as_of` date each was
  actually published — never interpolate between the two surveys. If one
  survey hasn't yet published a same-year-end target (e.g. early in the
  year), fall back to its most recently published value for that target and
  let the `as_of` date make the staleness visible.
- **S&P 500 (#7):** curated from publicly reported Wall Street strategist
  year-end index targets. These are typically a spread of individual bank
  targets, not a single number — the schema (§6) stores `value` as the
  median/consensus figure alongside `value_low`/`value_high` so the
  dispersion isn't discarded. Updated when a new round of targets is
  published (roughly annually, with updates if major revisions occur), with
  sources cited per entry.

For the other 9 series (including the LEI headline itself), the UI shows an
explicit **"No analyst consensus forecast available for this series"** state
with a one-line explanation of why, rather than inventing a number. If the
Conference Board publishes qualitative recession-signal commentary for the
headline LEI, that commentary (text, not a number) may be surfaced as
curated content alongside the headline chart.

## 5. Architecture

Single Docker container running a Next.js (TypeScript, App Router) app:

- **Web server** — Next.js serves pages and API routes. Reads only from the
  local SQLite file. No live upstream HTTP calls in the request path.
- **Refresh job** — a scheduled task running daily. Fetches each live FRED
  series and upserts a **rolling 180-day window** of observations (not just
  the latest point) into SQLite, since government series revise prior
  months' values after initial release; re-pulling only the newest point
  would silently freeze stale, since-revised numbers. Logs success/failure
  per series; a failure on one series does not block the others.
  - **Scheduling implementation:** registered via Next.js's
    `instrumentation.ts` `register()` hook rather than an ad-hoc timer
    scattered in app code, tying the job's lifecycle explicitly to the
    server process. v1 assumes the container always runs as a **single
    process/single replica** — this sidesteps duplicate-timer risk from
    multiple workers or hot-reload without adding a file/DB mutex lock,
    which would be unneeded complexity for a single-container self-hosted
    deployment. If this ever needs multiple replicas, add a lock before
    scaling, not before there's a reason to.
  - **Cold-start hydration:** on boot, before registering the recurring
    schedule, the job checks whether `observations` is empty (fresh
    deployment) and if so runs an immediate full-history fetch rather than
    waiting for the next scheduled time — otherwise a fresh container would
    show a blank dashboard for up to 24 hours.
- **SQLite file** — lives on a Docker volume (e.g. `/data/econ.db`) so it
  survives container restarts/rebuilds without re-fetching full history.
- **Curated content** — indicator descriptions, proxy labels, and the
  manually-maintained forecast/headline/ISM values are JSON files. The app
  reads them from a mounted volume path (e.g. `/data/curated/*.json`) if
  present, falling back to the repo-committed defaults otherwise. A monthly
  data update (new ISM reading, new LEI headline number) is then a file
  drop onto the volume, not a rebuild-and-redeploy of the image — the
  repo-committed copies remain the versioned baseline/starting point.

Rejected alternatives (from the design discussion): a second container for
the refresh job (unnecessary operational overhead for ~11 series), and
fetch-on-request with no background job (adds latency and upstream rate-limit
risk on every visit, and you explicitly want a long-running self-hosted
container with scheduled refresh).

## 6. Data model (SQLite)

```
indicators
  id            TEXT PRIMARY KEY   -- e.g. "avg_weekly_hours_mfg"
  lei_component INTEGER NULL       -- 1-10, NULL for the headline
  fred_series   TEXT NULL          -- e.g. "AWHMAN", NULL if no live series
  is_proxy      BOOLEAN
  proxy_note    TEXT NULL          -- shown in UI when is_proxy = true
  frequency     TEXT               -- "daily" | "weekly" | "monthly"
  units         TEXT               -- e.g. "Hours", "Thousands", "Percent", "Index (1982=100)"
  inverted      BOOLEAN DEFAULT FALSE  -- true = rising value signals worsening conditions
  display_format TEXT              -- formatting mask for UI (decimals, "%", "$")

observations
  indicator_id  TEXT REFERENCES indicators(id)
  date          TEXT               -- ISO date of the observation period
  value         REAL
  fetched_at    TEXT               -- ISO timestamp of when we pulled it
  PRIMARY KEY (indicator_id, date)

forecasts                          -- only for the 2 series with real coverage
  indicator_id  TEXT REFERENCES indicators(id)
  as_of         TEXT               -- date the forecast was actually published
  horizon       TEXT               -- target date, e.g. "2026-12-31"
  value         REAL               -- median/consensus figure
  value_low     REAL NULL          -- low end of published range (e.g. 10th pct or min)
  value_high    REAL NULL          -- high end of published range (e.g. 90th pct or max)
  source_url    TEXT
  source_label  TEXT               -- e.g. "Philly Fed SPF, 2026 Q3"
  PRIMARY KEY (indicator_id, as_of, horizon)

refresh_log
  indicator_id  TEXT
  run_at        TEXT
  status        TEXT               -- "ok" | "error"
  detail        TEXT NULL
```
`refresh_log` carries an index on `(indicator_id, run_at)` so the staleness
checks in §8 don't require a full table scan across all 11 indicators.

Curated descriptions/content (not in SQLite — versioned JSON in the repo):

```
content/indicators/<id>.json     -- repo-committed defaults; shape-identical
                                   -- overrides may live at /data/curated/<id>.json
{
  "title": "...",
  "whatItMeasures": "...",
  "whatItPredicts": "...",
  "sourceName": "...",
  "sourceUrl": "...",
  "isProxy": true,
  "proxyExplanation": "...",
  "proxyMethodologyUrl": "..."    -- linked from the proxy UI badge (§7)
}

content/headline.json             -- the LEI headline card's curated content
{
  "indexLevel": 0,
  "momPercentChange": 0,
  "sixMonthAnnualizedGrowth": 0,  -- the Conference Board's own 3D rule
                                   -- (duration/depth/diffusion) leans on
                                   -- momentum, not the raw level
  "asOf": "2026-09-30",
  "recessionSignalCommentary": "..."  -- optional qualitative text from CB's release
}
```

## 7. Frontend

- One dashboard page listing all 11 series as interactive chart cards
  (sparkline/overview), each linking to a detail view with the full
  historical chart, forecast overlay (when available) or the "no forecast"
  state, and the curated description/source panel.
- Charts are dynamic/interactive (zoom, hover tooltips, time-range select).
  Chart implementation follows the dataviz skill's guidance (form, color,
  interaction rules) at build time rather than being specified here.
- Detail-view historical charts include **NBER recession shading** (FRED
  series `USREC`, free, no proxy needed) — the main real-world use of
  LEI-style indicators is judging lead time before downturns, so showing
  past recessions in context is core to the feature, not decoration.
- Indicators flagged `inverted` (§6) get a visible "higher = weaker" note
  and an inverted color sense so a rising line doesn't read as good news.
- Proxy/substitute badges (#3, #4, #8, #10) link directly to that
  indicator's `proxyExplanation`/`proxyMethodologyUrl`, not just a generic
  "this is a proxy" tooltip — the point is letting a reader actually see
  how the substitute can diverge from the official component.
- The LEI headline gets a distinct, prominent card at the top of the
  dashboard (not just another grid tile), showing the index level, 1-month
  % change, **and** the 6-month annualized growth rate, since the
  Conference Board's own recession-signal rule (duration/depth/diffusion)
  is driven by momentum, not the raw level.

## 8. Error handling

- Refresh job: per-series try/catch; one series failing (bad response,
  FRED API key issue, network error) logs to `refresh_log` and does not
  stop the other series from refreshing.
- If a series has never successfully fetched (e.g. first boot before the
  first scheduled run, or persistent failure), its card shows a "data
  unavailable" state rather than a broken chart.
- Stale data: if the latest observation is older than the series' expected
  publication cadence (e.g. a weekly series with no update in 3+ weeks),
  show a small "last updated" badge so staleness is visible, not hidden.
- Manual/curated data (headline LEI, ISM proxy, forecasts) has no automated
  freshness check — staleness here is an editorial/content responsibility,
  flagged via a visible "as of <date>" label sourced from the content file.
- **Revisions:** because the refresh job re-pulls a rolling 180-day window
  (§5) rather than only the newest point, a revised prior-month value from
  the source simply overwrites the old row via the existing
  `PRIMARY KEY (indicator_id, date)` upsert — no separate revision-detection
  logic is needed.

## 9. Testing

Per standard TDD workflow:
- Unit tests for each FRED series fetcher/parser (mocked HTTP responses,
  including malformed/missing-data cases).
- Unit tests for the SQLite upsert logic (idempotency — re-running a fetch
  for the same date doesn't duplicate rows).
- Unit tests for the rate-spread forecast computation (combining the two
  curated source values correctly).
- Integration test for the refresh job: one failing series doesn't prevent
  others from succeeding.
- Component tests for the "no forecast available" and "stale data" UI
  states, since those are easy to silently regress.

## 10. Docker

- Single `Dockerfile`, multi-stage build (Next.js build stage + slim
  runtime stage).
- `docker-compose.yml` with one service, one named volume mounted at
  `/data` for the SQLite file.
- `FRED_API_KEY` passed as an environment variable (free key, user
  registers at FRED).
- Container's internal scheduler (registered via `instrumentation.ts`, §5)
  fires the refresh job daily; no external scheduler/host cron dependency.

## 11. Open items for implementation time

- Decide exact wording/sourcing cadence for the S&P 500 strategist-target
  curation (which outlets/roundups to cite).

Resolved during spec review (both confirmed via direct source-checking,
not assumption — see §3):
- Component #3 (consumer goods and materials): `ACOGNO` is the final free
  proxy. The Conference Board's own Feb 2026 LEI Technical Notes footnote
  this component as "based on our estimates," confirming it's an internal
  estimate with no single public series to fully replicate — not a gap in
  our research.
- Component #10 (consumer expectations): `UMCSENT` is the final free
  proxy. FRED's own search catalog has no series titled "Index of Consumer
  Expectations" — `UMCSENT` is the only University of Michigan survey
  series FRED carries.
