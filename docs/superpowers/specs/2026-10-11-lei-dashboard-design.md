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
| 3 | New orders, consumer goods and materials | FRED `ACOGNO` (consumer goods only — Census discontinued the combined "and materials" series; "materials" portion not separately available free) | Live, **partial proxy** |
| 4 | ISM Index of New Orders | No free API (ISM licenses the data series; only the monthly headline commentary is free) | **Manual proxy** — entered monthly from ISM's free press release, labeled as manually curated |
| 5 | New orders, nondefense capital goods ex-aircraft | FRED `NEWORDER` | Live, direct |
| 6 | Building permits, new private housing | FRED `PERMIT` | Live, direct |
| 7 | S&P 500 | FRED `SP500` | Live, direct |
| 8 | Leading Credit Index | Proprietary, no free equivalent | **Substitute proxy**: Chicago Fed National Financial Conditions Index, FRED `NFCI` — labeled clearly as a substitute, not the official LCI |
| 9 | Interest rate spread (10yr Treasury − Fed funds) | FRED `T10YFF` | Live, direct |
| 10 | Consumer expectations | FRED `UMCSENT` (overall Michigan Sentiment index — the Michigan survey's distinct "Index of Consumer Expectations" sub-index is not confirmed available as a standalone free FRED series; verify during implementation and fall back to `UMCSENT` if unavailable) | Live, **partial proxy** |
| — | **Official LEI headline** (index level + MoM % change) | Conference Board monthly press release (free, not an API) | **Manual entry**, monthly |

Every proxy/substitute is labeled as such in the UI, not presented as the
official component.

## 4. Analyst predictions: realistic coverage

Individual LEI components are inputs to forecasting, not targets of published
consensus forecasts. Only two of the eleven series above can carry a
genuine, sourced forward-looking value in v1:

- **Interest rate spread (#9):** computed from two independent free,
  citable sources — the Fed's Summary of Economic Projections (fed funds
  rate path) and the Philadelphia Fed's Survey of Professional Forecasters
  (10-year Treasury yield median forecast). Both are quarterly and manually
  transcribed into the curated-forecast data file, with the source document
  cited.
- **S&P 500 (#7):** curated from publicly reported Wall Street strategist
  year-end index targets (financial press, e.g. year-end outlook roundups).
  Updated when a new round of targets is published (roughly annually, with
  updates if major revisions occur), with sources cited per entry.

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
- **Refresh job** — a scheduled task (`node-cron`) running in the same
  Node process, triggered daily. Fetches each live FRED series, upserts new
  observations into SQLite. Logs success/failure per series; a failure on
  one series does not block the others.
- **SQLite file** — lives on a Docker volume (e.g. `/data/econ.db`) so it
  survives container restarts/rebuilds without re-fetching full history.
- **Curated content** — indicator descriptions, proxy labels, and the
  manually-maintained forecast/headline values live in versioned JSON/YAML
  files in the repo (not the database), since they change rarely and should
  go through normal code review/git history, not a live-editable store.

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

observations
  indicator_id  TEXT REFERENCES indicators(id)
  date          TEXT               -- ISO date of the observation period
  value         REAL
  fetched_at    TEXT               -- ISO timestamp of when we pulled it
  PRIMARY KEY (indicator_id, date)

forecasts                          -- only for the 2 series with real coverage
  indicator_id  TEXT REFERENCES indicators(id)
  as_of         TEXT               -- date the forecast was published
  horizon       TEXT               -- e.g. "2026-Q4"
  value         REAL
  source_url    TEXT
  source_label  TEXT               -- e.g. "Philly Fed SPF, 2026 Q3"

refresh_log
  indicator_id  TEXT
  run_at        TEXT
  status        TEXT               -- "ok" | "error"
  detail        TEXT NULL
```

Curated descriptions/content (not in SQLite — versioned JSON in the repo):

```
content/indicators/<id>.json
{
  "title": "...",
  "whatItMeasures": "...",
  "whatItPredicts": "...",
  "sourceName": "...",
  "sourceUrl": "...",
  "isProxy": true,
  "proxyExplanation": "..."
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
- The LEI headline gets a distinct, prominent card at the top of the
  dashboard (not just another grid tile), since it's the recognizable
  number people look for.

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
- Container's internal `node-cron` schedule fires the refresh job; no
  external scheduler/host cron dependency.

## 11. Open items for implementation time

- Confirm the exact FRED series (if any) for the Michigan survey's
  standalone "Index of Consumer Expectations" sub-index; fall back to
  `UMCSENT` if it doesn't exist as a free series.
- Confirm whether a combined "consumer goods and materials" series exists
  anywhere free, or whether `ACOGNO` (consumer goods only) is the final
  answer for component #3.
- Decide exact wording/sourcing cadence for the S&P 500 strategist-target
  curation (which outlets/roundups to cite).
