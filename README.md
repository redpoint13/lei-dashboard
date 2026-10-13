# LEI Dashboard

An interactive dashboard for the Conference Board's **Leading Economic Index
(LEI)** — the headline index plus all 10 official components, backed by live
FRED data, NBER recession shading, and sourced analyst forecasts.

Every component is paired with a plain-language description of what it
measures and what it predicts, and links back to its original source.

## Features

- **All 10 LEI components + the headline index**, each as an interactive
  time-series chart (Recharts), with NBER recession periods shaded on the
  chart.
- **Live data** pulled from the [FRED API](https://fred.stlouisfed.org/docs/api/fred/)
  on a scheduled refresh (no manual intervention required once a
  `FRED_API_KEY` is configured).
- **Sourced forecasts**, not fabricated ones — pulled from the Fed's Summary
  of Economic Projections, the Philadelphia Fed's Livingston Survey, and
  Reuters polls of Wall Street strategists, each with a link to its source.
- **Proxy transparency** — two of the Conference Board's official components
  are proprietary with no free public equivalent (ISM New Orders, the
  Leading Credit Index). Where a free FRED series is used as a proxy
  instead, the dashboard says so explicitly and explains the gap.
- **Self-hosted**, single Docker container, SQLite-backed, no external
  database required.
- **Curated content overrides** — descriptions, forecasts, and
  manually-tracked series (like ISM New Orders) can be updated by editing
  JSON on a mounted volume, with no image rebuild.

## Indicators

| Indicator | FRED series | Notes |
|---|---|---|
| Average weekly hours, manufacturing | `AWHMAN` | |
| Initial unemployment claims | `ICSA` | Inverted (higher = worse) |
| New orders, consumer goods & materials | `ACOGNO` | Proxy — consumer-goods portion only |
| ISM New Orders Index | — | No free API; transcribed monthly from ISM's public press release |
| New orders, non-defense capital goods | `NEWORDER` | |
| Building permits | `PERMIT` | |
| S&P 500 | `SP500` | Daily |
| Leading Credit Index | `NFCI` | Proxy — Chicago Fed's National Financial Conditions Index |
| 10yr Treasury – Fed Funds rate spread | `T10YFF` | Daily |
| Consumer expectations | `UMCSENT` | Proxy — University of Michigan Consumer Sentiment |

See [docs/superpowers/specs/2026-10-11-lei-dashboard-design.md](docs/superpowers/specs/2026-10-11-lei-dashboard-design.md)
for the full design rationale, including why each proxy was chosen.

## Getting started

### Run with Docker (recommended)

```bash
echo "FRED_API_KEY=your_key_here" > .env
docker compose up -d
```

Get a free FRED API key at https://fred.stlouisfed.org/docs/api/api_key.html.

The dashboard will be available at http://localhost:3000. Data is persisted
in a named Docker volume (`econ-data`), so it survives container restarts
and rebuilds.

### Run locally (development)

```bash
npm install
npm run dev
```

By default, local runs store the SQLite database at `./.data` (override
with the `DATA_DIR` environment variable, same as the container).

### Tests

```bash
npm test
```

## Overriding curated content

Descriptions, forecasts, and the manually-tracked ISM New Orders series ship
with real, cited defaults in `content/`. To override any of them without
rebuilding the image, drop a replacement JSON file at the matching path
under `curated/` on the mounted data volume, e.g.:

```
/data/curated/indicators/sp500.json
/data/curated/headline.json
/data/curated/manual-observations/ism_new_orders.json
/data/curated/forecasts/sp500.json
```

An override that's missing, unparsable, or the wrong shape is ignored and
the dashboard falls back to the repo-committed default for that one file —
a bad override never takes down the whole page.

## Tech stack

- Next.js 15 (App Router) + TypeScript + React 19
- SQLite (`better-sqlite3`) — no external database
- Recharts for charting
- Vitest + Testing Library

## License

MIT — see [LICENSE](LICENSE).
