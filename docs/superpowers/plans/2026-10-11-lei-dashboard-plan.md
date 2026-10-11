# LEI Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted, Dockerized Next.js dashboard showing the Conference Board's 10 Leading Economic Index components (plus the official headline value) as interactive historical charts, each with a genuine sourced forecast where one exists, NBER recession shading, and linked plain-language descriptions.

**Architecture:** Single Next.js (TypeScript, App Router) container. A scheduled in-process job fetches live FRED series into a local SQLite file on a Docker volume (rolling 180-day window to capture revisions, full history on first boot per indicator); the web app only ever reads from that SQLite file, never calling upstream APIs in the request path. Curated content (descriptions, proxy labels, manually-sourced forecasts, the LEI headline number) lives as JSON, read from a mounted volume override path with repo-committed defaults as fallback.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, `better-sqlite3`, Recharts, Vitest + `@testing-library/react`, Docker/docker-compose.

**Spec:** [docs/superpowers/specs/2026-10-11-lei-dashboard-design.md](../specs/2026-10-11-lei-dashboard-design.md)

## Global Constraints

- Timestamps are stored and passed as ISO 8601 UTC strings everywhere (DB, JSON, between modules); only UI components format to a local/display form. (Org `TIMEZONE.md`.)
- SQLite columns are `snake_case` (per spec §6); all TypeScript code is `camelCase`. The mapping between the two happens only inside `src/lib/db.ts` — no `snake_case` field names leak into any module that imports from it. (Org `NAMING_CONVENTIONS.md`.)
- Every task writes its failing test before its implementation code (CLAUDE.md "TDD is Non-Negotiable").
- An indicator with no genuine forecast source renders the explicit "no forecast available" state — never a fabricated number (spec §4).
- Every proxy/substitute indicator (#3, #4, #8, #10) is visibly labeled in the UI as a proxy, never presented as the official series (spec §3).
- The refresh job always pulls a rolling window (180 days, or full history for an indicator's first-ever fetch) — never only the single latest point (spec §5/§8).
- v1 assumes the container runs as a single process/single replica; no distributed lock is built for the scheduler (spec §5).
- Test stack is Vitest + `@testing-library/react` (org's established frontend convention).

## Review Focus

- **FRED returns `"."` (its missing-value marker) for some dates in a requested range.** The fetcher must turn these into `null`, not `0` or a crash, and downstream code must skip them rather than plot/average them as real zeros. (Task 6)
- **A proxy/substitute indicator's card renders without its proxy badge.** Because `isProxy` comes from the same content object driving the title/description, a card can't accidentally omit the badge just by a developer forgetting a separate flag — but the test must assert the badge is present whenever `content.isProxy` is true, not just that the card renders at all. (Task 11, Task 12)
- **An `inverted` indicator (initial claims, the credit-index proxy) renders without its "higher = weaker" annotation.** Same shape of risk as the proxy badge — must be asserted explicitly per indicator, not just smoke-tested. (Task 12)
- **Malformed or missing curated-content JSON on the mounted override path crashes the whole dashboard** instead of failing just the one affected card. The loader must catch, log, and fall back to the repo default rather than letting a bad file take down every indicator. (Task 4)
- **A container restart after a partially-failed first run** — some indicators already have observations, others never successfully fetched before the crash — must not be treated as all-or-nothing. Each indicator's fetch window (full history vs. rolling 180 days) is decided per-indicator, not from a single whole-database "has any data" flag, so a never-fetched indicator still gets its full-history pull even when its neighbors already have data. (Task 7)

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `vitest.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/lib/env.ts`
- Test: `src/lib/env.test.ts`
- Create: `.gitignore`

**Interfaces:**
- Produces: `getDataDir(): string` — reads `process.env.DATA_DIR`, defaults to `"./.data"` when unset (Docker sets `DATA_DIR=/data`, explicitly wired in Task 14).

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "econ-lei-dashboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "better-sqlite3": "^11.7.0",
    "recharts": "^2.14.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "vitest": "^2.1.0",
    "@vitejs/plugin-react": "^4.3.0",
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: installs cleanly, creates `package-lock.json`.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
```

- [ ] **Step 5: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

- [ ] **Step 6: Write the failing test for `getDataDir`**

```ts
// src/lib/env.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDataDir } from "./env";

describe("getDataDir", () => {
  const original = process.env.DATA_DIR;
  afterEach(() => {
    if (original === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = original;
  });

  it("defaults to ./.data when DATA_DIR is unset", () => {
    delete process.env.DATA_DIR;
    expect(getDataDir()).toBe("./.data");
  });

  it("uses DATA_DIR when set", () => {
    process.env.DATA_DIR = "/data";
    expect(getDataDir()).toBe("/data");
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run src/lib/env.test.ts`
Expected: FAIL with "Cannot find module './env'" (file doesn't exist yet).

- [ ] **Step 8: Write minimal implementation**

```ts
// src/lib/env.ts
export function getDataDir(): string {
  return process.env.DATA_DIR ?? "./.data";
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run src/lib/env.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 10: Write minimal app shell**

```tsx
// src/app/layout.tsx
export const metadata = { title: "LEI Dashboard" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// src/app/page.tsx
export default function DashboardPage() {
  return <main>LEI Dashboard</main>;
}
```

- [ ] **Step 11: Write `.gitignore`**

```
node_modules/
.next/
.data/
*.db
*.db-journal
*.db-wal
```

- [ ] **Step 12: Verify the app builds**

Run: `npm run build`
Expected: builds successfully with no type errors.

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts vitest.config.ts src/app/layout.tsx src/app/page.tsx src/lib/env.ts src/lib/env.test.ts .gitignore
git commit -m "Scaffold Next.js + TypeScript + Vitest project"
```

---

## Task 2: SQLite data-access layer

**Files:**
- Create: `src/lib/db.ts`
- Test: `src/lib/db.test.ts`

**Interfaces:**
- Consumes: `getDataDir()` from `src/lib/env.ts` (Task 1) — used by callers, not by this module directly (this module takes an explicit `dbPath`).
- Produces:
  - `openDb(dbPath: string): Database.Database`
  - `upsertObservations(db, indicatorId: string, observations: {date: string; value: number}[]): void`
  - `getObservations(db, indicatorId: string): {date: string; value: number}[]` (ascending by date)
  - `getLatestObservation(db, indicatorId: string): {date: string; value: number} | null`
  - `hasObservationsFor(db, indicatorId: string): boolean` — per-indicator check (Review Focus: cold-start must not be all-or-nothing)
  - `hasAnyObservations(db): boolean` — whole-database check, used only by the scheduler (Task 8) to decide whether to eagerly trigger a first run
  - `logRefresh(db, indicatorId: string, status: "ok" | "error", detail?: string): void`
  - `getRefreshLog(db, indicatorId: string, limit?: number): {runAt: string; status: string; detail: string | null}[]` (most recent first)
  - `upsertRecessionPeriods(db, periods: {startDate: string; endDate: string}[]): void`
  - `getRecessionPeriods(db): {startDate: string; endDate: string}[]`
  - `upsertForecast(db, forecast: {indicatorId: string; asOf: string; horizon: string; value: number; valueLow?: number; valueHigh?: number; sourceUrl: string; sourceLabel: string}): void`
  - `getLatestForecast(db, indicatorId: string): {asOf: string; horizon: string; value: number; valueLow: number | null; valueHigh: number | null; sourceUrl: string; sourceLabel: string} | null`
  - `seedIndicators(db, registry: {id: string; leiComponent: number | null; fredSeries: string | null; isProxy: boolean; proxyNote: string | null; frequency: string; units: string; inverted: boolean; displayFormat: string}[]): void`

- [ ] **Step 1: Write the failing schema test**

```ts
// src/lib/db.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "./db";
import type Database from "better-sqlite3";

function freshDb(): Database.Database {
  return openDb(":memory:");
}

describe("openDb", () => {
  it("creates all required tables", () => {
    const db = freshDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r: any) => r.name)
      .sort();
    expect(tables).toEqual(
      [
        "forecasts",
        "indicators",
        "observations",
        "recession_periods",
        "refresh_log",
      ].sort(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/db.test.ts`
Expected: FAIL with "Cannot find module './db'"

- [ ] **Step 3: Implement schema creation**

```ts
// src/lib/db.ts
import Database from "better-sqlite3";

export function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS indicators (
      id              TEXT PRIMARY KEY,
      lei_component   INTEGER,
      fred_series     TEXT,
      is_proxy        INTEGER NOT NULL DEFAULT 0,
      proxy_note      TEXT,
      frequency       TEXT NOT NULL,
      units           TEXT NOT NULL,
      inverted        INTEGER NOT NULL DEFAULT 0,
      display_format  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS observations (
      indicator_id  TEXT NOT NULL,
      date          TEXT NOT NULL,
      value         REAL NOT NULL,
      fetched_at    TEXT NOT NULL,
      PRIMARY KEY (indicator_id, date)
    );

    CREATE TABLE IF NOT EXISTS forecasts (
      indicator_id  TEXT NOT NULL,
      as_of         TEXT NOT NULL,
      horizon       TEXT NOT NULL,
      value         REAL NOT NULL,
      value_low     REAL,
      value_high    REAL,
      source_url    TEXT NOT NULL,
      source_label  TEXT NOT NULL,
      PRIMARY KEY (indicator_id, as_of, horizon)
    );

    CREATE TABLE IF NOT EXISTS refresh_log (
      indicator_id  TEXT NOT NULL,
      run_at        TEXT NOT NULL,
      status        TEXT NOT NULL,
      detail        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_log_indicator_run
      ON refresh_log (indicator_id, run_at);

    CREATE TABLE IF NOT EXISTS recession_periods (
      start_date TEXT PRIMARY KEY,
      end_date   TEXT NOT NULL
    );
  `);
  return db;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/db.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Write the failing observations test**

```ts
describe("upsertObservations / getObservations", () => {
  it("inserts and returns observations ascending by date", () => {
    const db = freshDb();
    upsertObservations(db, "sp500", [
      { date: "2026-01-02", value: 6100.5 },
      { date: "2026-01-01", value: 6090.1 },
    ]);
    expect(getObservations(db, "sp500")).toEqual([
      { date: "2026-01-01", value: 6090.1 },
      { date: "2026-01-02", value: 6100.5 },
    ]);
  });

  it("updates the value on a re-upsert for the same date instead of duplicating", () => {
    const db = freshDb();
    upsertObservations(db, "sp500", [{ date: "2026-01-01", value: 6090.1 }]);
    upsertObservations(db, "sp500", [{ date: "2026-01-01", value: 6095.0 }]);
    const rows = getObservations(db, "sp500");
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(6095.0);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/lib/db.test.ts`
Expected: FAIL — `upsertObservations`/`getObservations` not exported.

- [ ] **Step 7: Implement observations functions**

```ts
export function upsertObservations(
  db: Database.Database,
  indicatorId: string,
  observations: { date: string; value: number }[],
): void {
  const stmt = db.prepare(`
    INSERT INTO observations (indicator_id, date, value, fetched_at)
    VALUES (@indicatorId, @date, @value, @fetchedAt)
    ON CONFLICT(indicator_id, date) DO UPDATE SET
      value = excluded.value,
      fetched_at = excluded.fetched_at
  `);
  const fetchedAt = new Date().toISOString();
  const insertMany = db.transaction((rows: typeof observations) => {
    for (const row of rows) {
      stmt.run({ indicatorId, date: row.date, value: row.value, fetchedAt });
    }
  });
  insertMany(observations);
}

export function getObservations(
  db: Database.Database,
  indicatorId: string,
): { date: string; value: number }[] {
  return db
    .prepare(
      "SELECT date, value FROM observations WHERE indicator_id = ? ORDER BY date ASC",
    )
    .all(indicatorId) as { date: string; value: number }[];
}

export function getLatestObservation(
  db: Database.Database,
  indicatorId: string,
): { date: string; value: number } | null {
  const row = db
    .prepare(
      "SELECT date, value FROM observations WHERE indicator_id = ? ORDER BY date DESC LIMIT 1",
    )
    .get(indicatorId) as { date: string; value: number } | undefined;
  return row ?? null;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/lib/db.test.ts`
Expected: PASS

- [ ] **Step 9: Write the failing per-indicator and whole-db "has observations" test**

```ts
describe("hasObservationsFor / hasAnyObservations", () => {
  it("hasObservationsFor is true only for the indicator that has data", () => {
    const db = freshDb();
    upsertObservations(db, "sp500", [{ date: "2026-01-01", value: 6090.1 }]);
    expect(hasObservationsFor(db, "sp500")).toBe(true);
    expect(hasObservationsFor(db, "icsa")).toBe(false);
  });

  it("hasAnyObservations is true if any indicator has data, even if another has none", () => {
    const db = freshDb();
    expect(hasAnyObservations(db)).toBe(false);
    upsertObservations(db, "sp500", [{ date: "2026-01-01", value: 6090.1 }]);
    expect(hasAnyObservations(db)).toBe(true);
  });
});
```

- [ ] **Step 10: Run test to verify it fails, then implement**

```ts
export function hasObservationsFor(
  db: Database.Database,
  indicatorId: string,
): boolean {
  const row = db
    .prepare("SELECT 1 FROM observations WHERE indicator_id = ? LIMIT 1")
    .get(indicatorId);
  return row !== undefined;
}

export function hasAnyObservations(db: Database.Database): boolean {
  const row = db.prepare("SELECT 1 FROM observations LIMIT 1").get();
  return row !== undefined;
}
```

Run: `npx vitest run src/lib/db.test.ts`
Expected: PASS

- [ ] **Step 11: Write the failing refresh_log test**

```ts
describe("logRefresh / getRefreshLog", () => {
  it("records and returns entries most-recent-first", async () => {
    const db = freshDb();
    logRefresh(db, "sp500", "ok");
    await new Promise((r) => setTimeout(r, 2));
    logRefresh(db, "sp500", "error", "network timeout");
    const log = getRefreshLog(db, "sp500");
    expect(log).toHaveLength(2);
    expect(log[0].status).toBe("error");
    expect(log[0].detail).toBe("network timeout");
    expect(log[1].status).toBe("ok");
  });
});
```

- [ ] **Step 12: Run test to verify it fails, then implement**

```ts
export function logRefresh(
  db: Database.Database,
  indicatorId: string,
  status: "ok" | "error",
  detail?: string,
): void {
  db.prepare(
    "INSERT INTO refresh_log (indicator_id, run_at, status, detail) VALUES (?, ?, ?, ?)",
  ).run(indicatorId, new Date().toISOString(), status, detail ?? null);
}

export function getRefreshLog(
  db: Database.Database,
  indicatorId: string,
  limit = 20,
): { runAt: string; status: string; detail: string | null }[] {
  return db
    .prepare(
      "SELECT run_at as runAt, status, detail FROM refresh_log WHERE indicator_id = ? ORDER BY run_at DESC LIMIT ?",
    )
    .all(indicatorId, limit) as {
    runAt: string;
    status: string;
    detail: string | null;
  }[];
}
```

Run: `npx vitest run src/lib/db.test.ts`
Expected: PASS

- [ ] **Step 13: Write the failing recession_periods test**

```ts
describe("upsertRecessionPeriods / getRecessionPeriods", () => {
  it("stores and returns recession periods", () => {
    const db = freshDb();
    upsertRecessionPeriods(db, [
      { startDate: "2020-02-01", endDate: "2020-04-01" },
    ]);
    expect(getRecessionPeriods(db)).toEqual([
      { startDate: "2020-02-01", endDate: "2020-04-01" },
    ]);
  });
});
```

- [ ] **Step 14: Run test to verify it fails, then implement**

```ts
export function upsertRecessionPeriods(
  db: Database.Database,
  periods: { startDate: string; endDate: string }[],
): void {
  const stmt = db.prepare(`
    INSERT INTO recession_periods (start_date, end_date)
    VALUES (@startDate, @endDate)
    ON CONFLICT(start_date) DO UPDATE SET end_date = excluded.end_date
  `);
  const insertMany = db.transaction((rows: typeof periods) => {
    for (const row of rows) stmt.run(row);
  });
  insertMany(periods);
}

export function getRecessionPeriods(
  db: Database.Database,
): { startDate: string; endDate: string }[] {
  return db
    .prepare(
      "SELECT start_date as startDate, end_date as endDate FROM recession_periods ORDER BY start_date ASC",
    )
    .all() as { startDate: string; endDate: string }[];
}
```

Run: `npx vitest run src/lib/db.test.ts`
Expected: PASS

- [ ] **Step 15: Write the failing forecasts test**

```ts
describe("upsertForecast / getLatestForecast", () => {
  it("stores and returns the most recent forecast for an indicator", () => {
    const db = freshDb();
    upsertForecast(db, {
      indicatorId: "rate_spread",
      asOf: "2025-12-19",
      horizon: "2026-12-31",
      value: 0.6,
      valueLow: undefined,
      valueHigh: undefined,
      sourceUrl: "https://example.org/livingston",
      sourceLabel: "Philly Fed Livingston Survey, Dec 2025",
    });
    const forecast = getLatestForecast(db, "rate_spread");
    expect(forecast?.value).toBe(0.6);
    expect(forecast?.valueLow).toBeNull();
    expect(forecast?.horizon).toBe("2026-12-31");
  });

  it("returns null when no forecast exists", () => {
    const db = freshDb();
    expect(getLatestForecast(db, "avg_weekly_hours_mfg")).toBeNull();
  });
});
```

- [ ] **Step 16: Run test to verify it fails, then implement**

```ts
export function upsertForecast(
  db: Database.Database,
  forecast: {
    indicatorId: string;
    asOf: string;
    horizon: string;
    value: number;
    valueLow?: number;
    valueHigh?: number;
    sourceUrl: string;
    sourceLabel: string;
  },
): void {
  db.prepare(
    `
    INSERT INTO forecasts
      (indicator_id, as_of, horizon, value, value_low, value_high, source_url, source_label)
    VALUES (@indicatorId, @asOf, @horizon, @value, @valueLow, @valueHigh, @sourceUrl, @sourceLabel)
    ON CONFLICT(indicator_id, as_of, horizon) DO UPDATE SET
      value = excluded.value,
      value_low = excluded.value_low,
      value_high = excluded.value_high,
      source_url = excluded.source_url,
      source_label = excluded.source_label
  `,
  ).run({
    ...forecast,
    valueLow: forecast.valueLow ?? null,
    valueHigh: forecast.valueHigh ?? null,
  });
}

export function getLatestForecast(
  db: Database.Database,
  indicatorId: string,
): {
  asOf: string;
  horizon: string;
  value: number;
  valueLow: number | null;
  valueHigh: number | null;
  sourceUrl: string;
  sourceLabel: string;
} | null {
  const row = db
    .prepare(
      `SELECT as_of as asOf, horizon, value, value_low as valueLow, value_high as valueHigh,
              source_url as sourceUrl, source_label as sourceLabel
       FROM forecasts WHERE indicator_id = ? ORDER BY as_of DESC LIMIT 1`,
    )
    .get(indicatorId);
  return (row as any) ?? null;
}
```

Run: `npx vitest run src/lib/db.test.ts`
Expected: PASS

- [ ] **Step 17: Write the failing seedIndicators test**

```ts
describe("seedIndicators", () => {
  const sample = [
    {
      id: "sp500",
      leiComponent: 7,
      fredSeries: "SP500",
      isProxy: false,
      proxyNote: null,
      frequency: "daily",
      units: "Index",
      inverted: false,
      displayFormat: "points_2dp",
    },
  ];

  it("inserts indicator rows", () => {
    const db = freshDb();
    seedIndicators(db, sample);
    const row = db.prepare("SELECT * FROM indicators WHERE id = ?").get("sp500") as any;
    expect(row.fred_series).toBe("SP500");
    expect(row.is_proxy).toBe(0);
  });

  it("is idempotent across repeated calls", () => {
    const db = freshDb();
    seedIndicators(db, sample);
    seedIndicators(db, sample);
    const count = db.prepare("SELECT COUNT(*) as c FROM indicators").get() as { c: number };
    expect(count.c).toBe(1);
  });
});
```

- [ ] **Step 18: Run test to verify it fails, then implement**

```ts
export interface IndicatorDef {
  id: string;
  leiComponent: number | null;
  fredSeries: string | null;
  isProxy: boolean;
  proxyNote: string | null;
  frequency: string;
  units: string;
  inverted: boolean;
  displayFormat: string;
}

export function seedIndicators(
  db: Database.Database,
  registry: IndicatorDef[],
): void {
  const stmt = db.prepare(`
    INSERT INTO indicators
      (id, lei_component, fred_series, is_proxy, proxy_note, frequency, units, inverted, display_format)
    VALUES (@id, @leiComponent, @fredSeries, @isProxy, @proxyNote, @frequency, @units, @inverted, @displayFormat)
    ON CONFLICT(id) DO UPDATE SET
      lei_component = excluded.lei_component,
      fred_series = excluded.fred_series,
      is_proxy = excluded.is_proxy,
      proxy_note = excluded.proxy_note,
      frequency = excluded.frequency,
      units = excluded.units,
      inverted = excluded.inverted,
      display_format = excluded.display_format
  `);
  const insertMany = db.transaction((rows: IndicatorDef[]) => {
    for (const row of rows) {
      stmt.run({
        ...row,
        isProxy: row.isProxy ? 1 : 0,
        inverted: row.inverted ? 1 : 0,
      });
    }
  });
  insertMany(registry);
}
```

Run: `npx vitest run src/lib/db.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 19: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "Add SQLite data-access layer with per-indicator and whole-db freshness checks"
```

---

## Task 3: Indicator registry

**Files:**
- Create: `src/lib/indicator-registry.ts`
- Test: `src/lib/indicator-registry.test.ts`

**Interfaces:**
- Consumes: `IndicatorDef`, `seedIndicators` from `src/lib/db.ts` (Task 2)
- Produces: `INDICATOR_REGISTRY: IndicatorDef[]` (11 entries: 10 LEI components + the headline)

- [ ] **Step 1: Write the failing registry test**

```ts
// src/lib/indicator-registry.test.ts
import { describe, it, expect } from "vitest";
import { INDICATOR_REGISTRY } from "./indicator-registry";

describe("INDICATOR_REGISTRY", () => {
  it("has exactly 11 entries (10 LEI components + headline)", () => {
    expect(INDICATOR_REGISTRY).toHaveLength(11);
  });

  it("flags initial claims and the credit-index proxy as inverted", () => {
    const claims = INDICATOR_REGISTRY.find((i) => i.id === "initial_claims");
    const credit = INDICATOR_REGISTRY.find((i) => i.id === "leading_credit_index");
    expect(claims?.inverted).toBe(true);
    expect(credit?.inverted).toBe(true);
  });

  it("marks the headline as having no FRED series and no LEI component number", () => {
    const headline = INDICATOR_REGISTRY.find((i) => i.id === "headline");
    expect(headline?.fredSeries).toBeNull();
    expect(headline?.leiComponent).toBeNull();
  });

  it("marks exactly the 4 known proxies as proxies", () => {
    const proxies = INDICATOR_REGISTRY.filter((i) => i.isProxy).map((i) => i.id).sort();
    expect(proxies).toEqual(
      [
        "consumer_goods_orders",
        "ism_new_orders",
        "leading_credit_index",
        "consumer_expectations",
      ].sort(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/indicator-registry.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the registry**

```ts
// src/lib/indicator-registry.ts
import type { IndicatorDef } from "./db";

export const INDICATOR_REGISTRY: IndicatorDef[] = [
  {
    id: "avg_weekly_hours_mfg",
    leiComponent: 1,
    fredSeries: "AWHMAN",
    isProxy: false,
    proxyNote: null,
    frequency: "monthly",
    units: "Hours",
    inverted: false,
    displayFormat: "decimal_1dp",
  },
  {
    id: "initial_claims",
    leiComponent: 2,
    fredSeries: "ICSA",
    isProxy: false,
    proxyNote: null,
    frequency: "weekly",
    units: "Number",
    inverted: true,
    displayFormat: "integer",
  },
  {
    id: "consumer_goods_orders",
    leiComponent: 3,
    fredSeries: "ACOGNO",
    isProxy: true,
    proxyNote:
      "Consumer goods portion only. The Conference Board's own component is an internal estimate with no single public series to fully replicate (confirmed via their Feb 2026 LEI Technical Notes).",
    frequency: "monthly",
    units: "Millions of Dollars",
    inverted: false,
    displayFormat: "usd_millions",
  },
  {
    id: "ism_new_orders",
    leiComponent: 4,
    fredSeries: null,
    isProxy: true,
    proxyNote:
      "ISM licenses this series; no free API exists. Value is manually transcribed monthly from ISM's free press-release headline.",
    frequency: "monthly",
    units: "Index (50 = neutral)",
    inverted: false,
    displayFormat: "decimal_1dp",
  },
  {
    id: "capital_goods_orders",
    leiComponent: 5,
    fredSeries: "NEWORDER",
    isProxy: false,
    proxyNote: null,
    frequency: "monthly",
    units: "Millions of Dollars",
    inverted: false,
    displayFormat: "usd_millions",
  },
  {
    id: "building_permits",
    leiComponent: 6,
    fredSeries: "PERMIT",
    isProxy: false,
    proxyNote: null,
    frequency: "monthly",
    units: "Thousands of Units",
    inverted: false,
    displayFormat: "decimal_0dp",
  },
  {
    id: "sp500",
    leiComponent: 7,
    fredSeries: "SP500",
    isProxy: false,
    proxyNote: null,
    frequency: "daily",
    units: "Index",
    inverted: false,
    displayFormat: "points_2dp",
  },
  {
    id: "leading_credit_index",
    leiComponent: 8,
    fredSeries: "NFCI",
    isProxy: true,
    proxyNote:
      "The Conference Board's Leading Credit Index is proprietary with no free equivalent. The Chicago Fed's National Financial Conditions Index (NFCI) measures similar credit/financial conditions but is not the official LCI.",
    frequency: "weekly",
    units: "Standard Deviations from Average",
    inverted: true,
    displayFormat: "decimal_2dp",
  },
  {
    id: "rate_spread",
    leiComponent: 9,
    fredSeries: "T10YFF",
    isProxy: false,
    proxyNote: null,
    frequency: "daily",
    units: "Percentage Points",
    inverted: false,
    displayFormat: "decimal_2dp",
  },
  {
    id: "consumer_expectations",
    leiComponent: 10,
    fredSeries: "UMCSENT",
    isProxy: true,
    proxyNote:
      "The Michigan survey's standalone 'Index of Consumer Expectations' sub-index isn't published as its own free FRED series; UMCSENT (overall Consumer Sentiment, which blends current conditions with expectations) is the closest free proxy.",
    frequency: "monthly",
    units: "Index (1966 Q1=100)",
    inverted: false,
    displayFormat: "decimal_1dp",
  },
  {
    id: "headline",
    leiComponent: null,
    fredSeries: null,
    isProxy: false,
    proxyNote: null,
    frequency: "monthly",
    units: "Index (2016=100)",
    inverted: false,
    displayFormat: "decimal_1dp",
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/indicator-registry.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/indicator-registry.ts src/lib/indicator-registry.test.ts
git commit -m "Add static indicator registry for the 10 LEI components plus headline"
```

---

## Task 4: Curated content loader

**Files:**
- Create: `src/lib/content.ts`
- Test: `src/lib/content.test.ts`

**Interfaces:**
- Consumes: `getDataDir()` from `src/lib/env.ts` (Task 1)
- Produces:
  - `interface IndicatorContent { title: string; whatItMeasures: string; whatItPredicts: string; sourceName: string; sourceUrl: string; isProxy: boolean; proxyExplanation?: string; proxyMethodologyUrl?: string }`
  - `interface HeadlineContent { indexLevel: number; momPercentChange: number; sixMonthAnnualizedGrowth: number; asOf: string; recessionSignalCommentary?: string }`
  - `loadIndicatorContent(id: string): IndicatorContent`
  - `loadHeadlineContent(): HeadlineContent`
  - `loadManualObservations(id: string): { date: string; value: number }[]` — for indicators with no FRED series (today: only `ism_new_orders`) that are instead updated by hand; returns `[]` if no file exists rather than throwing, since not every manual-only indicator is guaranteed to have a file yet

- [ ] **Step 1: Write the failing fallback/override test**

```ts
// src/lib/content.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("loadIndicatorContent", () => {
  let overrideDir: string;

  beforeEach(() => {
    overrideDir = mkdtempSync(path.join(tmpdir(), "econ-content-"));
  });

  afterEach(() => {
    rmSync(overrideDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("loads the repo default when no override directory is set", async () => {
    vi.stubEnv("DATA_DIR", path.join(overrideDir, "does-not-exist"));
    const { loadIndicatorContent } = await import("./content");
    const content = loadIndicatorContent("sp500");
    expect(content.title).toContain("S&P 500");
  });

  it("prefers the override file when present on the mounted volume path", async () => {
    vi.stubEnv("DATA_DIR", overrideDir);
    mkdirSync(path.join(overrideDir, "curated"), { recursive: true });
    writeFileSync(
      path.join(overrideDir, "curated", "sp500.json"),
      JSON.stringify({
        title: "Overridden Title",
        whatItMeasures: "x",
        whatItPredicts: "y",
        sourceName: "z",
        sourceUrl: "https://example.org",
        isProxy: false,
      }),
    );
    const { loadIndicatorContent } = await import("./content");
    expect(loadIndicatorContent("sp500").title).toBe("Overridden Title");
  });

  it("falls back to the repo default and logs when the override file is malformed", async () => {
    vi.stubEnv("DATA_DIR", overrideDir);
    mkdirSync(path.join(overrideDir, "curated"), { recursive: true });
    writeFileSync(path.join(overrideDir, "curated", "sp500.json"), "{not valid json");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { loadIndicatorContent } = await import("./content");
    const content = loadIndicatorContent("sp500");
    expect(content.title).toContain("S&P 500");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/content.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the loader**

```ts
// src/lib/content.ts
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getDataDir } from "./env";

export interface IndicatorContent {
  title: string;
  whatItMeasures: string;
  whatItPredicts: string;
  sourceName: string;
  sourceUrl: string;
  isProxy: boolean;
  proxyExplanation?: string;
  proxyMethodologyUrl?: string;
}

export interface HeadlineContent {
  indexLevel: number;
  momPercentChange: number;
  sixMonthAnnualizedGrowth: number;
  asOf: string;
  recessionSignalCommentary?: string;
}

function loadJsonWithFallback<T>(
  overridePath: string,
  defaultPath: string,
): T {
  if (existsSync(overridePath)) {
    try {
      return JSON.parse(readFileSync(overridePath, "utf-8")) as T;
    } catch (err) {
      console.error(
        `Malformed curated content at ${overridePath}, falling back to default:`,
        err,
      );
    }
  }
  return JSON.parse(readFileSync(defaultPath, "utf-8")) as T;
}

export function loadIndicatorContent(id: string): IndicatorContent {
  const overridePath = path.join(getDataDir(), "curated", `${id}.json`);
  const defaultPath = path.join(
    process.cwd(),
    "content",
    "indicators",
    `${id}.json`,
  );
  return loadJsonWithFallback<IndicatorContent>(overridePath, defaultPath);
}

export function loadHeadlineContent(): HeadlineContent {
  const overridePath = path.join(getDataDir(), "curated", "headline.json");
  const defaultPath = path.join(process.cwd(), "content", "headline.json");
  return loadJsonWithFallback<HeadlineContent>(overridePath, defaultPath);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/content.test.ts`
Expected: PASS (3 tests) — note: this depends on `content/indicators/sp500.json` existing, created in Task 5. If running Task 4's tests before Task 5, temporarily skip or run both tasks' file creation together; the plan executes them in order so this file will already exist by the time this test runs for real.

- [ ] **Step 5: Write the failing manual-observations test**

```ts
// append to src/lib/content.test.ts
import { loadManualObservations } from "./content";

describe("loadManualObservations", () => {
  it("returns [] when no manual-observations file exists for an indicator", async () => {
    vi.stubEnv("DATA_DIR", overrideDir);
    const observations = loadManualObservations("does_not_exist_yet");
    expect(observations).toEqual([]);
    vi.unstubAllEnvs();
  });

  it("loads the real curated observations for ism_new_orders", () => {
    const observations = loadManualObservations("ism_new_orders");
    expect(observations.length).toBeGreaterThan(0);
    expect(observations[0]).toHaveProperty("date");
    expect(observations[0]).toHaveProperty("value");
  });
});
```

- [ ] **Step 6: Run test to verify it fails, then implement**

```ts
// append to src/lib/content.ts
export function loadManualObservations(
  id: string,
): { date: string; value: number }[] {
  const overridePath = path.join(
    getDataDir(),
    "curated",
    "manual-observations",
    `${id}.json`,
  );
  const defaultPath = path.join(
    process.cwd(),
    "content",
    "manual-observations",
    `${id}.json`,
  );
  const pathToUse = existsSync(overridePath) ? overridePath : defaultPath;
  if (!existsSync(pathToUse)) return [];
  try {
    const parsed = JSON.parse(readFileSync(pathToUse, "utf-8")) as {
      observations: { date: string; value: number }[];
    };
    return parsed.observations;
  } catch (err) {
    console.error(`Malformed manual observations at ${pathToUse}:`, err);
    return [];
  }
}
```

Run: `npx vitest run src/lib/content.test.ts`
Expected: PASS (5 tests) — the `ism_new_orders` case depends on `content/manual-observations/ism_new_orders.json`, created in Task 5.

- [ ] **Step 7: Commit**

```bash
git add src/lib/content.ts src/lib/content.test.ts
git commit -m "Add curated-content loader with volume override and safe fallback"
```

---

## Task 5: Real curated content files

**Files:**
- Create: `content/indicators/avg_weekly_hours_mfg.json`
- Create: `content/indicators/initial_claims.json`
- Create: `content/indicators/consumer_goods_orders.json`
- Create: `content/indicators/ism_new_orders.json`
- Create: `content/indicators/capital_goods_orders.json`
- Create: `content/indicators/building_permits.json`
- Create: `content/indicators/sp500.json`
- Create: `content/indicators/leading_credit_index.json`
- Create: `content/indicators/rate_spread.json`
- Create: `content/indicators/consumer_expectations.json`
- Create: `content/headline.json`
- Create: `content/manual-observations/ism_new_orders.json`
- Test: `src/lib/content-files.test.ts`

**Interfaces:**
- Consumes: `IndicatorContent`, `HeadlineContent`, `loadIndicatorContent`, `loadHeadlineContent` from `src/lib/content.ts` (Task 4); `INDICATOR_REGISTRY` from `src/lib/indicator-registry.ts` (Task 3)

- [ ] **Step 1: Write the failing schema-completeness test**

```ts
// src/lib/content-files.test.ts
import { describe, it, expect } from "vitest";
import { loadIndicatorContent, loadHeadlineContent } from "./content";
import { INDICATOR_REGISTRY } from "./indicator-registry";

describe("curated content files", () => {
  const nonHeadlineIds = INDICATOR_REGISTRY.filter((i) => i.id !== "headline").map(
    (i) => i.id,
  );

  it.each(nonHeadlineIds)("%s has complete, non-empty required fields", (id) => {
    const content = loadIndicatorContent(id);
    expect(content.title.length).toBeGreaterThan(0);
    expect(content.whatItMeasures.length).toBeGreaterThan(0);
    expect(content.whatItPredicts.length).toBeGreaterThan(0);
    expect(content.sourceUrl).toMatch(/^https:\/\//);
    const registryEntry = INDICATOR_REGISTRY.find((i) => i.id === id)!;
    expect(content.isProxy).toBe(registryEntry.isProxy);
    if (content.isProxy) {
      expect(content.proxyExplanation?.length).toBeGreaterThan(0);
    }
  });

  it("headline content has complete fields", () => {
    const headline = loadHeadlineContent();
    expect(headline.asOf.length).toBeGreaterThan(0);
    expect(typeof headline.indexLevel).toBe("number");
    expect(typeof headline.momPercentChange).toBe("number");
    expect(typeof headline.sixMonthAnnualizedGrowth).toBe("number");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/content-files.test.ts`
Expected: FAIL — content files don't exist yet.

- [ ] **Step 3: Write `content/indicators/avg_weekly_hours_mfg.json`**

```json
{
  "title": "Average Weekly Hours, Manufacturing",
  "whatItMeasures": "The average number of hours production and nonsupervisory employees worked per week in manufacturing, from the BLS Current Employment Statistics survey.",
  "whatItPredicts": "Employers typically adjust existing workers' hours before hiring or laying off staff, so this moves ahead of broader employment changes — a classic early signal of shifting labor demand.",
  "sourceName": "Bureau of Labor Statistics (via FRED, series AWHMAN)",
  "sourceUrl": "https://fred.stlouisfed.org/series/AWHMAN",
  "isProxy": false
}
```

- [ ] **Step 4: Write `content/indicators/initial_claims.json`**

```json
{
  "title": "Average Weekly Initial Jobless Claims",
  "whatItMeasures": "The number of people filing first-time claims for unemployment insurance each week, seasonally adjusted.",
  "whatItPredicts": "A rising trend signals weakening labor demand before it shows up in the monthly unemployment rate — this is a counter-cyclical indicator: rising claims mean worsening conditions, not improving ones.",
  "sourceName": "U.S. Department of Labor (via FRED, series ICSA)",
  "sourceUrl": "https://fred.stlouisfed.org/series/ICSA",
  "isProxy": false
}
```

- [ ] **Step 5: Write `content/indicators/consumer_goods_orders.json`**

```json
{
  "title": "New Orders, Consumer Goods and Materials",
  "whatItMeasures": "New factory orders for consumer goods — an indicator of near-term manufacturing demand tied to household spending.",
  "whatItPredicts": "Rising new orders signal manufacturers expect stronger consumer demand ahead; this is one of the more volatile, forward-looking LEI components.",
  "sourceName": "U.S. Census Bureau (via FRED, series ACOGNO)",
  "sourceUrl": "https://fred.stlouisfed.org/series/ACOGNO",
  "isProxy": true,
  "proxyExplanation": "The official Conference Board component combines consumer goods AND materials new orders, and is explicitly footnoted in their own technical notes as 'based on our estimates' — it is not a pass-through of any single public series. ACOGNO (consumer goods new orders only) is the closest free available input, not a full replica.",
  "proxyMethodologyUrl": "https://www.conference-board.org/pdf_free/press/US%20LEI%20Technical%20Notes-Feb%202026.pdf"
}
```

- [ ] **Step 6: Write `content/indicators/ism_new_orders.json`**

```json
{
  "title": "ISM Index of New Orders",
  "whatItMeasures": "A diffusion index from the Institute for Supply Management's monthly survey of purchasing managers, tracking whether new manufacturing orders are expanding (above 50) or contracting (below 50).",
  "whatItPredicts": "New orders lead production — purchasing managers see incoming demand before it shows up in output, making this one of the most responsive LEI components to changing business conditions.",
  "sourceName": "Institute for Supply Management",
  "sourceUrl": "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/pmi/",
  "isProxy": true,
  "proxyExplanation": "ISM licenses the full data series; there is no free API. This dashboard's value is transcribed monthly, by hand, from ISM's free public press-release headline — it is the real published figure, just not automatically fetched.",
  "proxyMethodologyUrl": "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/pmi/"
}
```

- [ ] **Step 7: Write `content/indicators/capital_goods_orders.json`**

```json
{
  "title": "New Orders, Nondefense Capital Goods Excluding Aircraft",
  "whatItMeasures": "New factory orders for business equipment and machinery, excluding the lumpy, defense and aircraft categories — a cleaner read on underlying business investment plans.",
  "whatItPredicts": "Businesses order capital equipment when they plan to expand capacity, so this leads broader business investment and, with a longer lag, overall economic output.",
  "sourceName": "U.S. Census Bureau (via FRED, series NEWORDER)",
  "sourceUrl": "https://fred.stlouisfed.org/series/NEWORDER",
  "isProxy": false
}
```

- [ ] **Step 8: Write `content/indicators/building_permits.json`**

```json
{
  "title": "Building Permits, New Private Housing Units",
  "whatItMeasures": "The number of new private housing units authorized by building permits, a leading signal of upcoming residential construction activity.",
  "whatItPredicts": "Permits are pulled before construction begins, so this leads actual housing starts and, with it, construction employment, materials demand, and related spending.",
  "sourceName": "U.S. Census Bureau (via FRED, series PERMIT)",
  "sourceUrl": "https://fred.stlouisfed.org/series/PERMIT",
  "isProxy": false
}
```

- [ ] **Step 9: Write `content/indicators/sp500.json`**

```json
{
  "title": "S&P 500 Stock Index",
  "whatItMeasures": "The market-capitalization-weighted price of the 500 largest publicly traded U.S. companies.",
  "whatItPredicts": "Stock prices reflect investors' aggregate, forward-looking expectations of corporate earnings and economic conditions — markets tend to move before the economic data confirms a turn.",
  "sourceName": "S&P Dow Jones Indices (via FRED, series SP500)",
  "sourceUrl": "https://fred.stlouisfed.org/series/SP500",
  "isProxy": false
}
```

- [ ] **Step 10: Write `content/indicators/leading_credit_index.json`**

```json
{
  "title": "Leading Credit Index",
  "whatItMeasures": "A composite of financial indicators (including interest rate spreads, credit conditions, and risk measures) designed to capture tightening or loosening in credit markets.",
  "whatItPredicts": "Credit conditions tend to tighten before economic downturns, as lenders pull back ahead of visible stress — this is a counter-cyclical-leaning measure where deteriorating (tighter) conditions are a warning sign, not a tailwind.",
  "sourceName": "The Conference Board (official index is proprietary)",
  "sourceUrl": "https://www.conference-board.org/topics/business-cycle-indicators",
  "isProxy": true,
  "proxyExplanation": "The Conference Board's Leading Credit Index is a proprietary, trademarked composite with no free public equivalent. This dashboard substitutes the Chicago Fed's National Financial Conditions Index (NFCI), which measures similar credit and financial-conditions stress but uses a different methodology and will diverge from the official LCI, especially during acute financial shocks.",
  "proxyMethodologyUrl": "https://www.chicagofed.org/research/data/nfci/current-data"
}
```

- [ ] **Step 11: Write `content/indicators/rate_spread.json`**

```json
{
  "title": "Interest Rate Spread (10-Year Treasury minus Fed Funds)",
  "whatItMeasures": "The gap between the 10-year Treasury yield and the federal funds rate — the slope of the yield curve between short- and long-term rates.",
  "whatItPredicts": "A narrowing or inverted spread (short-term rates above long-term rates) has preceded most post-war U.S. recessions, reflecting markets pricing in future rate cuts in response to a weakening outlook.",
  "sourceName": "Federal Reserve (via FRED, series T10YFF)",
  "sourceUrl": "https://fred.stlouisfed.org/series/T10YFF",
  "isProxy": false
}
```

- [ ] **Step 12: Write `content/indicators/consumer_expectations.json`**

```json
{
  "title": "Average Consumer Expectations for Business Conditions",
  "whatItMeasures": "How households expect their own finances, and the broader economy, to perform over the near and longer term.",
  "whatItPredicts": "Consumer spending drives most of U.S. GDP, so a shift in households' outlook — even before their actual spending changes — tends to lead changes in real economic activity.",
  "sourceName": "University of Michigan Surveys of Consumers",
  "sourceUrl": "https://fred.stlouisfed.org/series/UMCSENT",
  "isProxy": true,
  "proxyExplanation": "The official LEI component uses the Michigan survey's distinct 'Index of Consumer Expectations' sub-index. FRED does not carry that sub-index as its own free series — UMCSENT (overall Consumer Sentiment, which blends current conditions with expectations) is the closest free proxy and will move somewhat differently, especially when current conditions and expectations diverge.",
  "proxyMethodologyUrl": "https://www.sca.isr.umich.edu/"
}
```

- [ ] **Step 13: Write `content/headline.json`**

```json
{
  "indexLevel": 97.6,
  "momPercentChange": -0.2,
  "sixMonthAnnualizedGrowth": -2.4,
  "asOf": "2025-12-31",
  "recessionSignalCommentary": "The LEI fell for a fifth consecutive month in December 2025. Negative contributions from consumer expectations, the ISM New Orders Index, and average weekly manufacturing hours outweighed positive contributions from building permits, the S&P 500, and the interest rate spread. Source: The Conference Board, LEI Technical Notes, Feb 19 2026."
}
```

- [ ] **Step 14: Write `content/manual-observations/ism_new_orders.json`** (real, cited monthly values from ISM's published Manufacturing Report On Business; months not found in public reporting are genuinely omitted rather than invented — this reflects a real reporting gap, not a plan placeholder)

```json
{
  "observations": [
    { "date": "2025-01-01", "value": 55.1 },
    { "date": "2025-04-01", "value": 47.2 },
    { "date": "2025-05-01", "value": 47.6 },
    { "date": "2025-06-01", "value": 46.4 },
    { "date": "2025-07-01", "value": 47.1 },
    { "date": "2025-08-01", "value": 51.4 },
    { "date": "2025-09-01", "value": 48.9 },
    { "date": "2025-12-01", "value": 47.7 }
  ]
}
```

- [ ] **Step 15: Run test to verify it passes**

Run: `npx vitest run src/lib/content-files.test.ts`
Expected: PASS (11 tests: 10 indicators + headline)

- [ ] **Step 16: Commit**

```bash
git add content/
git commit -m "Add real curated content for all 10 LEI components and the headline"
```

---

## Task 6: FRED API client

**Files:**
- Create: `src/lib/fred-client.ts`
- Test: `src/lib/fred-client.test.ts`

**Interfaces:**
- Produces:
  - `class FredApiError extends Error { status?: number }`
  - `fetchFredSeries(seriesId: string, observationStart: string, apiKey: string, fetchImpl?: typeof fetch): Promise<{date: string; value: number | null}[]>`

- [ ] **Step 1: Write the failing parse-success test**

```ts
// src/lib/fred-client.test.ts
import { describe, it, expect, vi } from "vitest";
import { fetchFredSeries, FredApiError } from "./fred-client";

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe("fetchFredSeries", () => {
  it("parses a successful response into date/value pairs", async () => {
    const fetchImpl = mockFetch({
      observations: [
        { date: "2026-01-01", value: "6090.1" },
        { date: "2026-01-02", value: "6100.5" },
      ],
    });
    const result = await fetchFredSeries("SP500", "2025-07-01", "fake-key", fetchImpl);
    expect(result).toEqual([
      { date: "2026-01-01", value: 6090.1 },
      { date: "2026-01-02", value: 6100.5 },
    ]);
  });

  it("maps FRED's '.' missing-value marker to null instead of crashing or using 0", async () => {
    const fetchImpl = mockFetch({
      observations: [
        { date: "2026-01-01", value: "6090.1" },
        { date: "2026-01-02", value: "." },
      ],
    });
    const result = await fetchFredSeries("SP500", "2025-07-01", "fake-key", fetchImpl);
    expect(result).toEqual([
      { date: "2026-01-01", value: 6090.1 },
      { date: "2026-01-02", value: null },
    ]);
  });

  it("throws FredApiError with the HTTP status on a non-200 response", async () => {
    const fetchImpl = mockFetch({ error_message: "Bad API key" }, false, 400);
    await expect(
      fetchFredSeries("SP500", "2025-07-01", "bad-key", fetchImpl),
    ).rejects.toMatchObject(new FredApiError("", 400));
  });

  it("wraps a network failure in FredApiError", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    await expect(
      fetchFredSeries("SP500", "2025-07-01", "fake-key", fetchImpl),
    ).rejects.toBeInstanceOf(FredApiError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/fred-client.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the client**

```ts
// src/lib/fred-client.ts
export class FredApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "FredApiError";
    this.status = status;
  }
}

export async function fetchFredSeries(
  seriesId: string,
  observationStart: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ date: string; value: number | null }[]> {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("observation_start", observationStart);

  let response: Response;
  try {
    response = await fetchImpl(url.toString());
  } catch (err) {
    throw new FredApiError(
      `Network error fetching FRED series ${seriesId}: ${(err as Error).message}`,
    );
  }

  if (!response.ok) {
    throw new FredApiError(
      `FRED API returned ${response.status} for series ${seriesId}`,
      response.status,
    );
  }

  const body = (await response.json()) as {
    observations: { date: string; value: string }[];
  };

  return body.observations.map((obs) => ({
    date: obs.date,
    value: obs.value === "." ? null : Number(obs.value),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/fred-client.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/fred-client.ts src/lib/fred-client.test.ts
git commit -m "Add FRED API client with missing-value and error handling"
```

---

## Task 7: Refresh job

**Files:**
- Create: `src/lib/refresh.ts`
- Test: `src/lib/refresh.test.ts`

**Interfaces:**
- Consumes: `fetchFredSeries`, `FredApiError` (Task 6); `openDb`, `upsertObservations`, `hasObservationsFor`, `logRefresh`, `upsertRecessionPeriods` (Task 2); `IndicatorDef` (Task 2/3); `loadManualObservations` (Task 4)
- Produces:
  - `interface RefreshSummary { succeeded: string[]; failed: { id: string; error: string }[] }`
  - `refreshAll(db, registry: IndicatorDef[], apiKey: string, fetchImpl?: typeof fetch, now?: Date): Promise<RefreshSummary>`
  - `refreshRecessionPeriods(db, apiKey: string, fetchImpl?: typeof fetch): Promise<void>`
  - `applyManualObservations(db, registry: IndicatorDef[]): void` — for indicators with `fredSeries === null` other than the headline (today: `ism_new_orders`), loads curated observations and upserts them, so this card isn't permanently "data unavailable"

- [ ] **Step 1: Write the failing per-series isolation test**

```ts
// src/lib/refresh.test.ts
import { describe, it, expect, vi } from "vitest";
import { refreshAll, refreshRecessionPeriods } from "./refresh";
import { openDb, hasObservationsFor, getObservations, getRefreshLog, getRecessionPeriods, upsertObservations } from "./db";
import type { IndicatorDef } from "./db";

const registry: IndicatorDef[] = [
  { id: "a", leiComponent: 1, fredSeries: "SERIES_A", isProxy: false, proxyNote: null, frequency: "monthly", units: "x", inverted: false, displayFormat: "decimal_1dp" },
  { id: "b", leiComponent: 2, fredSeries: "SERIES_B", isProxy: false, proxyNote: null, frequency: "monthly", units: "x", inverted: false, displayFormat: "decimal_1dp" },
  { id: "headline", leiComponent: null, fredSeries: null, isProxy: false, proxyNote: null, frequency: "monthly", units: "x", inverted: false, displayFormat: "decimal_1dp" },
];

function fetchThatFailsFor(failingSeriesId: string) {
  return vi.fn(async (url: string) => {
    const parsed = new URL(url);
    if (parsed.searchParams.get("series_id") === failingSeriesId) {
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ observations: [{ date: "2026-01-01", value: "1.0" }] }),
    } as Response;
  }) as unknown as typeof fetch;
}

describe("refreshAll", () => {
  it("isolates a failing series so the others still succeed and get logged", async () => {
    const db = openDb(":memory:");
    const fetchImpl = fetchThatFailsFor("SERIES_A");
    const summary = await refreshAll(db, registry, "key", fetchImpl);
    expect(summary.succeeded).toEqual(["b"]);
    expect(summary.failed).toEqual([{ id: "a", error: expect.stringContaining("500") }]);
    expect(getRefreshLog(db, "a")[0].status).toBe("error");
    expect(getRefreshLog(db, "b")[0].status).toBe("ok");
    expect(getObservations(db, "b")).toHaveLength(1);
  });

  it("skips indicators with no FRED series (manual-only, like the headline)", async () => {
    const db = openDb(":memory:");
    const fetchImpl = fetchThatFailsFor("__none__");
    const summary = await refreshAll(db, registry, "key", fetchImpl);
    expect(summary.succeeded.sort()).toEqual(["a", "b"]);
    expect(getRefreshLog(db, "headline")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/refresh.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write the failing per-indicator window-sizing test**

```ts
describe("refreshAll window sizing", () => {
  it("requests full history for an indicator with zero prior observations, and only a 180-day window for one that already has data", async () => {
    const db = openDb(":memory:");
    const now = new Date("2026-06-15T00:00:00.000Z");
    const calls: { seriesId: string; start: string }[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      const parsed = new URL(url);
      calls.push({
        seriesId: parsed.searchParams.get("series_id")!,
        start: parsed.searchParams.get("observation_start")!,
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({ observations: [{ date: "2026-01-01", value: "1.0" }] }),
      } as Response;
    }) as unknown as typeof fetch;

    // Pre-seed indicator "b" with existing data so only "a" is cold.
    upsertObservations(db, "b", [{ date: "2025-01-01", value: 1 }]);

    await refreshAll(db, registry, "key", fetchImpl, now);

    const callA = calls.find((c) => c.seriesId === "SERIES_A")!;
    const callB = calls.find((c) => c.seriesId === "SERIES_B")!;
    expect(callA.start).toBe("1900-01-01"); // full history for the never-fetched indicator
    expect(callB.start).toBe("2025-12-17"); // 180 days before `now` for the warm indicator
  });
});
```

- [ ] **Step 4: Run test to verify it fails, then implement `refreshAll`**

```ts
// src/lib/refresh.ts
import type Database from "better-sqlite3";
import type { IndicatorDef } from "./db";
import {
  upsertObservations,
  hasObservationsFor,
  logRefresh,
  upsertRecessionPeriods,
} from "./db";
import { fetchFredSeries, FredApiError } from "./fred-client";

export interface RefreshSummary {
  succeeded: string[];
  failed: { id: string; error: string }[];
}

const ROLLING_WINDOW_DAYS = 180;
const FULL_HISTORY_START = "1900-01-01";

function windowStart(now: Date): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - ROLLING_WINDOW_DAYS);
  return d.toISOString().slice(0, 10);
}

export async function refreshAll(
  db: Database.Database,
  registry: IndicatorDef[],
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<RefreshSummary> {
  const summary: RefreshSummary = { succeeded: [], failed: [] };

  for (const indicator of registry) {
    if (!indicator.fredSeries) continue; // manual-only indicators (e.g. headline)

    const observationStart = hasObservationsFor(db, indicator.id)
      ? windowStart(now)
      : FULL_HISTORY_START;

    try {
      const observations = await fetchFredSeries(
        indicator.fredSeries,
        observationStart,
        apiKey,
        fetchImpl,
      );
      const clean = observations.filter(
        (o): o is { date: string; value: number } => o.value !== null,
      );
      upsertObservations(db, indicator.id, clean);
      logRefresh(db, indicator.id, "ok");
      summary.succeeded.push(indicator.id);
    } catch (err) {
      const message =
        err instanceof FredApiError ? err.message : String(err);
      logRefresh(db, indicator.id, "error", message);
      summary.failed.push({ id: indicator.id, error: message });
    }
  }

  return summary;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/refresh.test.ts`
Expected: PASS (so far)

- [ ] **Step 6: Write the failing recession-periods test**

```ts
describe("refreshRecessionPeriods", () => {
  it("converts USREC's 0/1 series into start/end date ranges", async () => {
    const db = openDb(":memory:");
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        observations: [
          { date: "2020-01-01", value: "0" },
          { date: "2020-02-01", value: "1" },
          { date: "2020-03-01", value: "1" },
          { date: "2020-04-01", value: "0" },
        ],
      }),
    }) as unknown as typeof fetch;

    await refreshRecessionPeriods(db, "key", fetchImpl);

    expect(getRecessionPeriods(db)).toEqual([
      { startDate: "2020-02-01", endDate: "2020-03-01" },
    ]);
  });
});
```

- [ ] **Step 7: Run test to verify it fails, then implement**

```ts
export async function refreshRecessionPeriods(
  db: Database.Database,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const observations = await fetchFredSeries(
    "USREC",
    FULL_HISTORY_START,
    apiKey,
    fetchImpl,
  );

  const periods: { startDate: string; endDate: string }[] = [];
  let currentStart: string | null = null;
  let previousDate: string | null = null;

  for (const obs of observations) {
    if (obs.value === 1 && currentStart === null) {
      currentStart = obs.date;
    } else if (obs.value !== 1 && currentStart !== null) {
      periods.push({ startDate: currentStart, endDate: previousDate! });
      currentStart = null;
    }
    previousDate = obs.date;
  }
  if (currentStart !== null) {
    periods.push({ startDate: currentStart, endDate: previousDate! });
  }

  upsertRecessionPeriods(db, periods);
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/lib/refresh.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 9: Write the failing manual-observations application test**

```ts
describe("applyManualObservations", () => {
  it("upserts curated observations for a manual-only indicator (not the headline)", () => {
    const db = openDb(":memory:");
    applyManualObservations(db, registry); // registry's "headline" entry must be skipped
    const ismRows = getObservations(db, "ism_new_orders");
    expect(ismRows.length).toBeGreaterThan(0);
    expect(getObservations(db, "headline")).toHaveLength(0);
  });

  it("is idempotent across repeated calls", () => {
    const db = openDb(":memory:");
    applyManualObservations(db, registry);
    applyManualObservations(db, registry);
    const ismRows = getObservations(db, "ism_new_orders");
    const dates = new Set(ismRows.map((r) => r.date));
    expect(dates.size).toBe(ismRows.length); // no duplicate dates
  });
});
```

Note: this test uses the plan's own `registry` fixture (ids `a`/`b`/`headline`), none of which is `ism_new_orders` — add one more entry to the shared `registry` array at the top of the file: `{ id: "ism_new_orders", leiComponent: 4, fredSeries: null, isProxy: true, proxyNote: null, frequency: "monthly", units: "x", inverted: false, displayFormat: "decimal_1dp" }`, and import `loadManualObservations` is not needed directly in the test — only in the implementation.

- [ ] **Step 10: Run test to verify it fails, then implement**

```ts
// append to src/lib/refresh.ts
import { loadManualObservations } from "./content";

export function applyManualObservations(
  db: Database.Database,
  registry: IndicatorDef[],
): void {
  for (const indicator of registry) {
    if (indicator.fredSeries !== null || indicator.id === "headline") continue;
    const observations = loadManualObservations(indicator.id);
    if (observations.length > 0) {
      upsertObservations(db, indicator.id, observations);
    }
  }
}
```

Run: `npx vitest run src/lib/refresh.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 11: Commit**

```bash
git add src/lib/refresh.ts src/lib/refresh.test.ts
git commit -m "Add refresh job with per-series isolation, per-indicator cold-start windowing, and manual-observation application"
```

---

## Task 8: Scheduler and instrumentation wiring

**Files:**
- Create: `src/lib/app-db.ts`
- Create: `src/lib/scheduler.ts`
- Test: `src/lib/scheduler.test.ts`
- Create: `instrumentation.ts`

**Interfaces:**
- Consumes: `openDb`, `hasAnyObservations`, `seedIndicators` (Task 2); `INDICATOR_REGISTRY` (Task 3); `refreshAll`, `refreshRecessionPeriods`, `applyManualObservations` (Task 7); `getDataDir` (Task 1)
- Produces:
  - `getAppDb(): Database.Database` (singleton, used by instrumentation.ts and later by page/route code in Tasks 11-13)
  - `startScheduler(options: { hasAnyObservations: () => boolean; intervalMs: number; runNow: () => Promise<void> }): { stop: () => void }`

- [ ] **Step 1: Write the failing cold-start scheduling test**

```ts
// src/lib/scheduler.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startScheduler } from "./scheduler";

describe("startScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs immediately on cold start (no existing observations)", async () => {
    const runNow = vi.fn().mockResolvedValue(undefined);
    const handle = startScheduler({
      hasAnyObservations: () => false,
      intervalMs: 1000,
      runNow,
    });
    await vi.waitFor(() => expect(runNow).toHaveBeenCalledTimes(1));
    handle.stop();
  });

  it("does not run immediately on a warm start (observations already exist)", () => {
    const runNow = vi.fn().mockResolvedValue(undefined);
    const handle = startScheduler({
      hasAnyObservations: () => true,
      intervalMs: 1000,
      runNow,
    });
    expect(runNow).not.toHaveBeenCalled();
    handle.stop();
  });

  it("runs again after each interval elapses, regardless of cold or warm start", async () => {
    const runNow = vi.fn().mockResolvedValue(undefined);
    const handle = startScheduler({
      hasAnyObservations: () => true,
      intervalMs: 1000,
      runNow,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(runNow).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runNow).toHaveBeenCalledTimes(2);
    handle.stop();
  });

  it("stop() prevents further scheduled runs", async () => {
    const runNow = vi.fn().mockResolvedValue(undefined);
    const handle = startScheduler({
      hasAnyObservations: () => true,
      intervalMs: 1000,
      runNow,
    });
    handle.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(runNow).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/scheduler.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the scheduler**

```ts
// src/lib/scheduler.ts
export function startScheduler(options: {
  hasAnyObservations: () => boolean;
  intervalMs: number;
  runNow: () => Promise<void>;
}): { stop: () => void } {
  const { hasAnyObservations, intervalMs, runNow } = options;

  if (!hasAnyObservations()) {
    void runNow();
  }

  const timer = setInterval(() => {
    void runNow();
  }, intervalMs);

  return {
    stop: () => clearInterval(timer),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/scheduler.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write `src/lib/app-db.ts`** (singleton; no dedicated test — thin wiring consumed by Task 11-13's view-model tests, which pass an explicit in-memory db instead)

```ts
// src/lib/app-db.ts
import path from "node:path";
import type Database from "better-sqlite3";
import { openDb } from "./db";
import { getDataDir } from "./env";

let instance: Database.Database | null = null;

export function getAppDb(): Database.Database {
  if (!instance) {
    instance = openDb(path.join(getDataDir(), "econ.db"));
  }
  return instance;
}
```

- [ ] **Step 6: Write `instrumentation.ts`**

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getAppDb } = await import("./src/lib/app-db");
  const { seedIndicators, hasAnyObservations } = await import("./src/lib/db");
  const { INDICATOR_REGISTRY } = await import("./src/lib/indicator-registry");
  const { refreshAll, refreshRecessionPeriods, applyManualObservations } = await import(
    "./src/lib/refresh"
  );
  const { startScheduler } = await import("./src/lib/scheduler");

  const db = getAppDb();
  seedIndicators(db, INDICATOR_REGISTRY);

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    console.error(
      "FRED_API_KEY is not set — the refresh job will not run. Set it in the environment.",
    );
    return;
  }

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  startScheduler({
    hasAnyObservations: () => hasAnyObservations(db),
    intervalMs: ONE_DAY_MS,
    runNow: async () => {
      await refreshAll(db, INDICATOR_REGISTRY, apiKey);
      await refreshRecessionPeriods(db, apiKey);
      applyManualObservations(db, INDICATOR_REGISTRY);
    },
  });
}
```

Note: `instrumentation.ts` is framework-invoked by Next.js at server start, not called directly in tests — it is intentionally a thin wrapper around `startScheduler` (tested above) and `refreshAll`/`refreshRecessionPeriods` (tested in Task 7), consistent with the spec's single-process scheduling decision (§5).

- [ ] **Step 7: Verify the app still builds**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 8: Commit**

```bash
git add src/lib/app-db.ts src/lib/scheduler.ts src/lib/scheduler.test.ts instrumentation.ts
git commit -m "Add scheduler with cold-start hydration and instrumentation.ts wiring"
```

---

## Task 9: Forecast computation

**Files:**
- Create: `src/lib/forecasts.ts`
- Test: `src/lib/forecasts.test.ts`
- Create: `content/forecasts/rate-spread-inputs.json`
- Create: `content/forecasts/sp500.json`
- Modify: `instrumentation.ts` (adds the new `applyCuratedForecasts` call to the scheduled run, alongside the `refreshAll`/`refreshRecessionPeriods`/`applyManualObservations` calls Task 8 already wired in)

**Interfaces:**
- Consumes: `upsertForecast` from `src/lib/db.ts` (Task 2)
- Produces:
  - `interface ForecastInput { asOf: string; horizon: string; value: number; sourceUrl: string; sourceLabel: string }`
  - `interface ForecastValue { asOf: string; horizon: string; value: number; valueLow?: number; valueHigh?: number; sourceUrl: string; sourceLabel: string }`
  - `computeRateSpreadForecast(fedFunds: ForecastInput, treasury10yr: ForecastInput): ForecastValue | null`
  - `loadRateSpreadForecast(): ForecastValue | null`
  - `loadSp500Forecast(): ForecastValue`
  - `applyCuratedForecasts(db): void` — loads the rate-spread and S&P 500 forecasts and upserts them into the `forecasts` table, so the view-model (Task 12) reads forecasts from the database like every other piece of displayed data, rather than re-reading JSON files at render time

- [ ] **Step 1: Write the failing horizon-matching test**

```ts
// src/lib/forecasts.test.ts
import { describe, it, expect } from "vitest";
import { computeRateSpreadForecast, loadRateSpreadForecast, loadSp500Forecast } from "./forecasts";

describe("computeRateSpreadForecast", () => {
  const fedFunds = {
    asOf: "2025-12-10",
    horizon: "2026-12-31",
    value: 3.4,
    sourceUrl: "https://example.org/sep",
    sourceLabel: "Federal Reserve SEP, Dec 10 2025",
  };
  const treasury10yr = {
    asOf: "2025-12-19",
    horizon: "2026-12-31",
    value: 4.0,
    sourceUrl: "https://example.org/livingston",
    sourceLabel: "Philly Fed Livingston Survey, Dec 2025",
  };

  it("computes the spread when both inputs target the same horizon", () => {
    const forecast = computeRateSpreadForecast(fedFunds, treasury10yr);
    expect(forecast?.value).toBeCloseTo(0.6, 5);
    expect(forecast?.horizon).toBe("2026-12-31");
  });

  it("returns null when the two inputs target different horizons, rather than interpolating", () => {
    const mismatched = { ...treasury10yr, horizon: "2027-12-31" };
    expect(computeRateSpreadForecast(fedFunds, mismatched)).toBeNull();
  });
});

describe("loadRateSpreadForecast / loadSp500Forecast", () => {
  it("loads the real curated rate-spread inputs and computes a forecast", () => {
    const forecast = loadRateSpreadForecast();
    expect(forecast).not.toBeNull();
    expect(forecast!.value).toBeCloseTo(0.6, 5);
  });

  it("loads the real curated S&P 500 forecast with a low/high range", () => {
    const forecast = loadSp500Forecast();
    expect(forecast.valueLow).toBeLessThan(forecast.value);
    expect(forecast.value).toBeLessThan(forecast.valueHigh!);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/forecasts.test.ts`
Expected: FAIL — module and content files don't exist.

- [ ] **Step 3: Write `content/forecasts/rate-spread-inputs.json`** (real, cited figures — see spec §4)

```json
{
  "fedFunds": {
    "asOf": "2025-12-10",
    "horizon": "2026-12-31",
    "value": 3.4,
    "sourceUrl": "https://www.newyorkfed.org/medialibrary/media/markets/fomc-economicprojections-20251210.pdf",
    "sourceLabel": "Federal Reserve Summary of Economic Projections, Dec 10 2025"
  },
  "treasury10yr": {
    "asOf": "2025-12-19",
    "horizon": "2026-12-31",
    "value": 4.0,
    "sourceUrl": "https://www.philadelphiafed.org/-/media/FRBP/Assets/Surveys-And-Data/livingston-survey/2025/livdec25.pdf",
    "sourceLabel": "Philadelphia Fed Livingston Survey, December 2025"
  }
}
```

- [ ] **Step 4: Write `content/forecasts/sp500.json`** (real, cited figures — see spec §4)

```json
{
  "asOf": "2026-01-06",
  "horizon": "2026-12-31",
  "value": 7600,
  "valueLow": 7100,
  "valueHigh": 8100,
  "sourceUrl": "https://www.fool.com/investing/2026/01/06/stock-market-soar-2026-wall-street-answer-investor",
  "sourceLabel": "Reuters poll of 19 Wall Street strategists, January 2026"
}
```

- [ ] **Step 5: Implement `src/lib/forecasts.ts`**

```ts
// src/lib/forecasts.ts
import { readFileSync } from "node:fs";
import path from "node:path";

export interface ForecastInput {
  asOf: string;
  horizon: string;
  value: number;
  sourceUrl: string;
  sourceLabel: string;
}

export interface ForecastValue {
  asOf: string;
  horizon: string;
  value: number;
  valueLow?: number;
  valueHigh?: number;
  sourceUrl: string;
  sourceLabel: string;
}

export function computeRateSpreadForecast(
  fedFunds: ForecastInput,
  treasury10yr: ForecastInput,
): ForecastValue | null {
  if (fedFunds.horizon !== treasury10yr.horizon) {
    return null; // never interpolate across mismatched horizons — spec §4
  }
  return {
    asOf: `${fedFunds.asOf} (Fed) / ${treasury10yr.asOf} (Livingston)`,
    horizon: fedFunds.horizon,
    value: treasury10yr.value - fedFunds.value,
    sourceUrl: treasury10yr.sourceUrl,
    sourceLabel: `${fedFunds.sourceLabel}; ${treasury10yr.sourceLabel}`,
  };
}

export function loadRateSpreadForecast(): ForecastValue | null {
  const inputsPath = path.join(
    process.cwd(),
    "content",
    "forecasts",
    "rate-spread-inputs.json",
  );
  const { fedFunds, treasury10yr } = JSON.parse(
    readFileSync(inputsPath, "utf-8"),
  ) as { fedFunds: ForecastInput; treasury10yr: ForecastInput };
  return computeRateSpreadForecast(fedFunds, treasury10yr);
}

export function loadSp500Forecast(): ForecastValue {
  const forecastPath = path.join(
    process.cwd(),
    "content",
    "forecasts",
    "sp500.json",
  );
  return JSON.parse(readFileSync(forecastPath, "utf-8")) as ForecastValue;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/forecasts.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Write the failing applyCuratedForecasts test**

```ts
// append to src/lib/forecasts.test.ts
import { openDb, getLatestForecast } from "./db";

describe("applyCuratedForecasts", () => {
  it("upserts both the rate-spread and S&P 500 forecasts into the database", () => {
    const db = openDb(":memory:");
    applyCuratedForecasts(db);
    const rateSpread = getLatestForecast(db, "rate_spread");
    const sp500 = getLatestForecast(db, "sp500");
    expect(rateSpread?.value).toBeCloseTo(0.6, 5);
    expect(sp500?.value).toBe(7600);
    expect(sp500?.valueLow).toBe(7100);
  });

  it("is idempotent across repeated calls", () => {
    const db = openDb(":memory:");
    applyCuratedForecasts(db);
    applyCuratedForecasts(db);
    const rows = db.prepare("SELECT COUNT(*) as c FROM forecasts").get() as { c: number };
    expect(rows.c).toBe(2); // one row each for rate_spread and sp500, not duplicated
  });
});
```

- [ ] **Step 8: Run test to verify it fails, then implement**

```ts
// append to src/lib/forecasts.ts
import type Database from "better-sqlite3";
import { upsertForecast } from "./db";

export function applyCuratedForecasts(db: Database.Database): void {
  const rateSpread = loadRateSpreadForecast();
  if (rateSpread) {
    upsertForecast(db, { indicatorId: "rate_spread", ...rateSpread });
  }

  const sp500 = loadSp500Forecast();
  upsertForecast(db, { indicatorId: "sp500", ...sp500 });
}
```

Run: `npx vitest run src/lib/forecasts.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 9: Modify `instrumentation.ts`** to call the new function on every scheduled run, alongside the calls Task 8 already wired in

```ts
// instrumentation.ts — update the existing imports and runNow callback
// (full file, replacing the version written in Task 8)
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getAppDb } = await import("./src/lib/app-db");
  const { seedIndicators, hasAnyObservations } = await import("./src/lib/db");
  const { INDICATOR_REGISTRY } = await import("./src/lib/indicator-registry");
  const { refreshAll, refreshRecessionPeriods, applyManualObservations } = await import(
    "./src/lib/refresh"
  );
  const { applyCuratedForecasts } = await import("./src/lib/forecasts");
  const { startScheduler } = await import("./src/lib/scheduler");

  const db = getAppDb();
  seedIndicators(db, INDICATOR_REGISTRY);

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    console.error(
      "FRED_API_KEY is not set — the refresh job will not run. Set it in the environment.",
    );
    return;
  }

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  startScheduler({
    hasAnyObservations: () => hasAnyObservations(db),
    intervalMs: ONE_DAY_MS,
    runNow: async () => {
      await refreshAll(db, INDICATOR_REGISTRY, apiKey);
      await refreshRecessionPeriods(db, apiKey);
      applyManualObservations(db, INDICATOR_REGISTRY);
      applyCuratedForecasts(db);
    },
  });
}
```

- [ ] **Step 10: Verify the app still builds**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 11: Commit**

```bash
git add src/lib/forecasts.ts src/lib/forecasts.test.ts content/forecasts/ instrumentation.ts
git commit -m "Add forecast computation with real cited rate-spread and S&P 500 figures, wired into the scheduled refresh"
```

---

## Task 10: Staleness and formatting utilities

**Files:**
- Create: `src/lib/staleness.ts`
- Create: `src/lib/format.ts`
- Test: `src/lib/staleness.test.ts`
- Test: `src/lib/format.test.ts`

**Interfaces:**
- Produces:
  - `isStale(frequency: "daily" | "weekly" | "monthly", lastObservedDate: string, now: Date): boolean`
  - `formatValue(value: number, displayFormat: string): string`

- [ ] **Step 1: Write the failing staleness test**

```ts
// src/lib/staleness.test.ts
import { describe, it, expect } from "vitest";
import { isStale } from "./staleness";

describe("isStale", () => {
  const now = new Date("2026-06-15T00:00:00.000Z");

  it("daily series is stale after 5+ days with no update", () => {
    expect(isStale("daily", "2026-06-09", now)).toBe(true);
    expect(isStale("daily", "2026-06-11", now)).toBe(false);
  });

  it("weekly series is stale after 3+ weeks with no update", () => {
    expect(isStale("weekly", "2026-05-24", now)).toBe(true);
    expect(isStale("weekly", "2026-06-01", now)).toBe(false);
  });

  it("monthly series is stale after 45+ days with no update", () => {
    expect(isStale("monthly", "2026-04-20", now)).toBe(true);
    expect(isStale("monthly", "2026-05-15", now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails, then implement**

```ts
// src/lib/staleness.ts
const THRESHOLD_DAYS: Record<"daily" | "weekly" | "monthly", number> = {
  daily: 5,
  weekly: 21,
  monthly: 45,
};

export function isStale(
  frequency: "daily" | "weekly" | "monthly",
  lastObservedDate: string,
  now: Date,
): boolean {
  const last = new Date(`${lastObservedDate}T00:00:00.000Z`);
  const diffDays = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= THRESHOLD_DAYS[frequency];
}
```

Run: `npx vitest run src/lib/staleness.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 3: Write the failing format test**

```ts
// src/lib/format.test.ts
import { describe, it, expect } from "vitest";
import { formatValue } from "./format";

describe("formatValue", () => {
  it("formats integer", () => expect(formatValue(220000, "integer")).toBe("220,000"));
  it("formats decimal_0dp", () => expect(formatValue(1319.4, "decimal_0dp")).toBe("1,319"));
  it("formats decimal_1dp", () => expect(formatValue(34.567, "decimal_1dp")).toBe("34.6"));
  it("formats decimal_2dp", () => expect(formatValue(0.6, "decimal_2dp")).toBe("0.60"));
  it("formats percent_1dp", () => expect(formatValue(-0.2, "percent_1dp")).toBe("-0.2%"));
  it("formats usd_millions", () => expect(formatValue(245517, "usd_millions")).toBe("$245,517M"));
  it("formats points_2dp", () => expect(formatValue(6100.456, "points_2dp")).toBe("6,100.46"));
});
```

- [ ] **Step 4: Run test to verify it fails, then implement**

```ts
// src/lib/format.ts
export function formatValue(value: number, displayFormat: string): string {
  switch (displayFormat) {
    case "integer":
      return Math.round(value).toLocaleString("en-US");
    case "decimal_0dp":
      return value.toLocaleString("en-US", { maximumFractionDigits: 0, minimumFractionDigits: 0 });
    case "decimal_1dp":
      return value.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
    case "decimal_2dp":
      return value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
    case "percent_1dp":
      return `${value.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
    case "usd_millions":
      return `$${Math.round(value).toLocaleString("en-US")}M`;
    case "points_2dp":
      return value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
    default:
      return String(value);
  }
}
```

Run: `npx vitest run src/lib/format.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/staleness.ts src/lib/staleness.test.ts src/lib/format.ts src/lib/format.test.ts
git commit -m "Add staleness detection and value formatting utilities"
```

---

## Task 11: Dashboard page and cards

**Files:**
- Create: `src/lib/view-model.ts`
- Test: `src/lib/view-model.test.ts`
- Create: `src/components/HeadlineCard.tsx`
- Test: `src/components/HeadlineCard.test.tsx`
- Create: `src/components/IndicatorCard.tsx`
- Test: `src/components/IndicatorCard.test.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `getAppDb` (Task 8); `getLatestObservation`, `getObservations` (Task 2); `INDICATOR_REGISTRY` (Task 3); `loadIndicatorContent`, `loadHeadlineContent` (Task 4); `isStale` (Task 10); `IndicatorContent`, `HeadlineContent` (Task 4)
- Produces:
  - `interface DashboardCardViewModel { id: string; content: IndicatorContent; latestValue: { date: string; value: number } | null; recentObservations: { date: string; value: number }[]; displayFormat: string; inverted: boolean; isStale: boolean }`
  - `interface DashboardViewModel { headline: HeadlineContent; cards: DashboardCardViewModel[] }`
  - `buildDashboardViewModel(db, now?: Date): DashboardViewModel`
  - `<HeadlineCard content={HeadlineContent} />`
  - `<IndicatorCard card={DashboardCardViewModel} />` — renders a small sparkline from `recentObservations` (spec §7 calls the overview cards "interactive chart cards (sparkline/overview)", not plain text)

- [ ] **Step 1: Write the failing view-model test**

```ts
// src/lib/view-model.test.ts
import { describe, it, expect } from "vitest";
import { openDb, upsertObservations, seedIndicators, upsertRecessionPeriods } from "./db";
import { INDICATOR_REGISTRY } from "./indicator-registry";
import { buildDashboardViewModel } from "./view-model";

describe("buildDashboardViewModel", () => {
  it("includes the headline and one card per non-headline indicator, with data-unavailable for indicators with no observations", () => {
    const db = openDb(":memory:");
    seedIndicators(db, INDICATOR_REGISTRY);
    const now = new Date("2026-06-15T00:00:00.000Z");
    upsertObservations(db, "sp500", [{ date: "2026-06-14", value: 6100.5 }]);

    const viewModel = buildDashboardViewModel(db, now);

    expect(viewModel.cards).toHaveLength(10); // all registry entries except "headline"
    const sp500Card = viewModel.cards.find((c) => c.id === "sp500")!;
    expect(sp500Card.latestValue).toEqual({ date: "2026-06-14", value: 6100.5 });
    expect(sp500Card.recentObservations).toEqual([{ date: "2026-06-14", value: 6100.5 }]);
    expect(sp500Card.isStale).toBe(false);

    const claimsCard = viewModel.cards.find((c) => c.id === "initial_claims")!;
    expect(claimsCard.latestValue).toBeNull();
    expect(claimsCard.inverted).toBe(true);

    expect(viewModel.headline.indexLevel).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/view-model.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `view-model.ts`** (dashboard portion only — the detail-view additions come in Task 12)

```ts
// src/lib/view-model.ts
import type Database from "better-sqlite3";
import { getLatestObservation, getObservations } from "./db";
import { INDICATOR_REGISTRY } from "./indicator-registry";
import { loadIndicatorContent, loadHeadlineContent } from "./content";
import type { IndicatorContent, HeadlineContent } from "./content";
import { isStale } from "./staleness";

const SPARKLINE_POINTS = 24;

export interface DashboardCardViewModel {
  id: string;
  content: IndicatorContent;
  latestValue: { date: string; value: number } | null;
  recentObservations: { date: string; value: number }[];
  displayFormat: string;
  inverted: boolean;
  isStale: boolean;
}

export interface DashboardViewModel {
  headline: HeadlineContent;
  cards: DashboardCardViewModel[];
}

export function buildDashboardViewModel(
  db: Database.Database,
  now: Date = new Date(),
): DashboardViewModel {
  const cards = INDICATOR_REGISTRY.filter((indicator) => indicator.id !== "headline").map(
    (indicator) => {
      const latestValue = getLatestObservation(db, indicator.id);
      const recentObservations = getObservations(db, indicator.id).slice(
        -SPARKLINE_POINTS,
      );
      return {
        id: indicator.id,
        content: loadIndicatorContent(indicator.id),
        latestValue,
        recentObservations,
        displayFormat: indicator.displayFormat,
        inverted: indicator.inverted,
        isStale: latestValue
          ? isStale(
              indicator.frequency as "daily" | "weekly" | "monthly",
              latestValue.date,
              now,
            )
          : false,
      };
    },
  );

  return { headline: loadHeadlineContent(), cards };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/view-model.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing HeadlineCard test**

```tsx
// src/components/HeadlineCard.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeadlineCard } from "./HeadlineCard";

describe("HeadlineCard", () => {
  it("shows the index level, 1-month change, and 6-month annualized growth", () => {
    render(
      <HeadlineCard
        content={{
          indexLevel: 97.6,
          momPercentChange: -0.2,
          sixMonthAnnualizedGrowth: -2.4,
          asOf: "2025-12-31",
          recessionSignalCommentary: "Fell for a fifth consecutive month.",
        }}
      />,
    );
    expect(screen.getByText(/97\.6/)).toBeInTheDocument();
    expect(screen.getByText(/-0\.2%/)).toBeInTheDocument();
    expect(screen.getByText(/-2\.4%/)).toBeInTheDocument();
    expect(screen.getByText(/Fell for a fifth consecutive month/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails, then implement**

```tsx
// src/components/HeadlineCard.tsx
import type { HeadlineContent } from "@/lib/content";

export function HeadlineCard({ content }: { content: HeadlineContent }) {
  return (
    <section aria-label="LEI Headline" style={{ border: "2px solid", padding: "1rem" }}>
      <h2>The Conference Board Leading Economic Index</h2>
      <p>Level: {content.indexLevel.toFixed(1)} (as of {content.asOf})</p>
      <p>1-month change: {content.momPercentChange.toFixed(1)}%</p>
      <p>6-month annualized growth: {content.sixMonthAnnualizedGrowth.toFixed(1)}%</p>
      {content.recessionSignalCommentary && <p>{content.recessionSignalCommentary}</p>}
    </section>
  );
}
```

Run: `npx vitest run src/components/HeadlineCard.test.tsx`
Expected: PASS

- [ ] **Step 7: Write the failing IndicatorCard test**

```tsx
// src/components/IndicatorCard.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IndicatorCard } from "./IndicatorCard";
import type { DashboardCardViewModel } from "@/lib/view-model";

const baseCard: DashboardCardViewModel = {
  id: "sp500",
  content: {
    title: "S&P 500 Stock Index",
    whatItMeasures: "x",
    whatItPredicts: "y",
    sourceName: "z",
    sourceUrl: "https://example.org",
    isProxy: false,
  },
  latestValue: { date: "2026-06-14", value: 6100.5 },
  recentObservations: [
    { date: "2026-06-10", value: 6080.2 },
    { date: "2026-06-12", value: 6090.1 },
    { date: "2026-06-14", value: 6100.5 },
  ],
  displayFormat: "points_2dp",
  inverted: false,
  isStale: false,
};

describe("IndicatorCard", () => {
  it("renders the formatted latest value", () => {
    render(<IndicatorCard card={baseCard} />);
    expect(screen.getByText(/6,100\.50/)).toBeInTheDocument();
  });

  it("renders a sparkline chart when recent observations exist", () => {
    const { container } = render(<IndicatorCard card={baseCard} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("shows 'data unavailable' and no sparkline when there is no observation", () => {
    const { container } = render(
      <IndicatorCard card={{ ...baseCard, latestValue: null, recentObservations: [] }} />,
    );
    expect(screen.getByText(/data unavailable/i)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("shows a stale badge when isStale is true", () => {
    render(<IndicatorCard card={{ ...baseCard, isStale: true }} />);
    expect(screen.getByText(/last updated/i)).toBeInTheDocument();
  });

  it("shows a proxy badge whenever content.isProxy is true", () => {
    render(
      <IndicatorCard
        card={{
          ...baseCard,
          content: { ...baseCard.content, isProxy: true, proxyExplanation: "substitute series" },
        }}
      />,
    );
    expect(screen.getByText(/proxy/i)).toBeInTheDocument();
  });

  it("does not show a proxy badge when content.isProxy is false", () => {
    render(<IndicatorCard card={baseCard} />);
    expect(screen.queryByText(/proxy/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run test to verify it fails, then implement**

```tsx
// src/components/IndicatorCard.tsx
"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";
import type { DashboardCardViewModel } from "@/lib/view-model";
import { formatValue } from "@/lib/format";

export function IndicatorCard({ card }: { card: DashboardCardViewModel }) {
  return (
    <article aria-label={card.content.title} style={{ border: "1px solid", padding: "0.75rem" }}>
      <h3>{card.content.title}</h3>
      {card.content.isProxy && <span>Proxy series</span>}
      {card.latestValue ? (
        <>
          <p>{formatValue(card.latestValue.value, card.displayFormat)}</p>
          {card.recentObservations.length > 0 && (
            <ResponsiveContainer width="100%" height={48}>
              <LineChart data={card.recentObservations}>
                <Line type="monotone" dataKey="value" dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          )}
          {card.isStale && <span>Last updated {card.latestValue.date} (stale)</span>}
        </>
      ) : (
        <p>Data unavailable</p>
      )}
      {card.inverted && <small>Higher = weaker</small>}
      <a href={`/indicators/${card.id}`}>View details</a>
    </article>
  );
}
```

Run: `npx vitest run src/components/IndicatorCard.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 9: Wire up `src/app/page.tsx`**

```tsx
// src/app/page.tsx
import { getAppDb } from "@/lib/app-db";
import { buildDashboardViewModel } from "@/lib/view-model";
import { HeadlineCard } from "@/components/HeadlineCard";
import { IndicatorCard } from "@/components/IndicatorCard";

export default function DashboardPage() {
  const viewModel = buildDashboardViewModel(getAppDb());
  return (
    <main>
      <HeadlineCard content={viewModel.headline} />
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem" }}>
        {viewModel.cards.map((card) => (
          <IndicatorCard key={card.id} card={card} />
        ))}
      </section>
    </main>
  );
}
```

- [ ] **Step 10: Verify the app still builds**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 11: Commit**

```bash
git add src/lib/view-model.ts src/lib/view-model.test.ts src/components/HeadlineCard.tsx src/components/HeadlineCard.test.tsx src/components/IndicatorCard.tsx src/components/IndicatorCard.test.tsx src/app/page.tsx
git commit -m "Add dashboard page with headline card and indicator grid"
```

---

## Task 12: Indicator detail page and chart

**Files:**
- Modify: `src/lib/view-model.ts`
- Modify: `src/lib/view-model.test.ts`
- Create: `src/components/ProxyBadge.tsx`
- Test: `src/components/ProxyBadge.test.tsx`
- Create: `src/components/IndicatorChart.tsx`
- Test: `src/components/IndicatorChart.test.tsx`
- Create: `src/app/indicators/[id]/page.tsx`

**Interfaces:**
- Consumes: `getObservations`, `getRecessionPeriods`, `getLatestForecast` (Task 2); `applyCuratedForecasts` (Task 9, used only by tests to seed the `forecasts` table before asserting); everything from Task 11's view-model
- Produces:
  - `interface IndicatorDetailViewModel { id: string; content: IndicatorContent; observations: {date:string; value:number}[]; recessionPeriods: {startDate:string; endDate:string}[]; inverted: boolean; displayFormat: string; forecast: { asOf: string; horizon: string; value: number; valueLow?: number | null; valueHigh?: number | null; sourceUrl: string; sourceLabel: string } | null; noForecastReason: string | null }`
  - `buildIndicatorDetailViewModel(db, id: string): IndicatorDetailViewModel`
  - `<ProxyBadge explanation={string} methodologyUrl={string} />`
  - `<IndicatorChart viewModel={IndicatorDetailViewModel} />`

- [ ] **Step 1: Write the failing detail-view-model test (forecast coverage)**

```ts
// append to src/lib/view-model.test.ts
import { buildIndicatorDetailViewModel } from "./view-model";
import { applyCuratedForecasts } from "./forecasts";

describe("buildIndicatorDetailViewModel", () => {
  it("attaches a computed forecast for rate_spread", () => {
    const db = openDb(":memory:");
    seedIndicators(db, INDICATOR_REGISTRY);
    applyCuratedForecasts(db);
    const detail = buildIndicatorDetailViewModel(db, "rate_spread");
    expect(detail.forecast).not.toBeNull();
    expect(detail.noForecastReason).toBeNull();
  });

  it("attaches a curated forecast for sp500", () => {
    const db = openDb(":memory:");
    seedIndicators(db, INDICATOR_REGISTRY);
    applyCuratedForecasts(db);
    const detail = buildIndicatorDetailViewModel(db, "sp500");
    expect(detail.forecast).not.toBeNull();
  });

  it("gives an explicit reason instead of a forecast for the other 8 series", () => {
    const db = openDb(":memory:");
    seedIndicators(db, INDICATOR_REGISTRY);
    applyCuratedForecasts(db); // even with forecasts applied, this series has none
    const detail = buildIndicatorDetailViewModel(db, "avg_weekly_hours_mfg");
    expect(detail.forecast).toBeNull();
    expect(detail.noForecastReason).toMatch(/no analyst consensus forecast/i);
  });

  it("includes recession periods and the indicator's observations", () => {
    const db = openDb(":memory:");
    seedIndicators(db, INDICATOR_REGISTRY);
    upsertObservations(db, "sp500", [{ date: "2026-01-01", value: 6090.1 }]);
    upsertRecessionPeriods(db, [{ startDate: "2020-02-01", endDate: "2020-04-01" }]);
    const detail = buildIndicatorDetailViewModel(db, "sp500");
    expect(detail.observations).toEqual([{ date: "2026-01-01", value: 6090.1 }]);
    expect(detail.recessionPeriods).toEqual([{ startDate: "2020-02-01", endDate: "2020-04-01" }]);
  });
});
```

(The imports `upsertObservations`, `upsertRecessionPeriods` are already present at the top of `view-model.test.ts` from Task 11's Step 1; only the two new import lines above need adding.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/view-model.test.ts`
Expected: FAIL — `buildIndicatorDetailViewModel` not exported.

- [ ] **Step 3: Extend `view-model.ts`**

```ts
// append to src/lib/view-model.ts
import { getObservations, getRecessionPeriods, getLatestForecast } from "./db";

export interface IndicatorDetailViewModel {
  id: string;
  content: IndicatorContent;
  observations: { date: string; value: number }[];
  recessionPeriods: { startDate: string; endDate: string }[];
  inverted: boolean;
  displayFormat: string;
  forecast: {
    asOf: string;
    horizon: string;
    value: number;
    valueLow?: number | null;
    valueHigh?: number | null;
    sourceUrl: string;
    sourceLabel: string;
  } | null;
  noForecastReason: string | null;
}

const NO_FORECAST_REASON =
  "No analyst consensus forecast available for this series — most individual LEI components are inputs to forecasting, not published forecast targets themselves.";

export function buildIndicatorDetailViewModel(
  db: Database.Database,
  id: string,
): IndicatorDetailViewModel {
  const indicator = INDICATOR_REGISTRY.find((i) => i.id === id)!;
  const forecast = getLatestForecast(db, id);
  return {
    id,
    content: loadIndicatorContent(id),
    observations: getObservations(db, id),
    recessionPeriods: getRecessionPeriods(db),
    inverted: indicator.inverted,
    displayFormat: indicator.displayFormat,
    forecast,
    noForecastReason: forecast ? null : NO_FORECAST_REASON,
  };
}
```

Note: `getLatestForecast` works uniformly here because `applyCuratedForecasts` (Task 9) is the only thing that ever writes to the `forecasts` table, and it only writes rows for `rate_spread` and `sp500` — every other indicator ID simply has no row, so `getLatestForecast` naturally returns `null` for them without this function needing to special-case indicator IDs itself.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/view-model.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Write the failing ProxyBadge test**

```tsx
// src/components/ProxyBadge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProxyBadge } from "./ProxyBadge";

describe("ProxyBadge", () => {
  it("renders the explanation and links to the methodology note", () => {
    render(
      <ProxyBadge
        explanation="Substitute series, not the official component."
        methodologyUrl="https://example.org/methodology"
      />,
    );
    expect(screen.getByText(/substitute series/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /methodology/i })).toHaveAttribute(
      "href",
      "https://example.org/methodology",
    );
  });
});
```

- [ ] **Step 6: Run test to verify it fails, then implement**

```tsx
// src/components/ProxyBadge.tsx
export function ProxyBadge({
  explanation,
  methodologyUrl,
}: {
  explanation: string;
  methodologyUrl?: string;
}) {
  return (
    <aside role="note" aria-label="Proxy series notice">
      <strong>Proxy series:</strong> {explanation}
      {methodologyUrl && (
        <a href={methodologyUrl}>Read the methodology note</a>
      )}
    </aside>
  );
}
```

Run: `npx vitest run src/components/ProxyBadge.test.tsx`
Expected: PASS

- [ ] **Step 7: Write the failing IndicatorChart test**

```tsx
// src/components/IndicatorChart.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IndicatorChart } from "./IndicatorChart";
import type { IndicatorDetailViewModel } from "@/lib/view-model";

const base: IndicatorDetailViewModel = {
  id: "avg_weekly_hours_mfg",
  content: {
    title: "Average Weekly Hours, Manufacturing",
    whatItMeasures: "x",
    whatItPredicts: "y",
    sourceName: "z",
    sourceUrl: "https://example.org",
    isProxy: false,
  },
  observations: [
    { date: "2025-01-01", value: 40.1 },
    { date: "2025-02-01", value: 40.3 },
  ],
  recessionPeriods: [{ startDate: "2020-02-01", endDate: "2020-04-01" }],
  inverted: false,
  displayFormat: "decimal_1dp",
  forecast: null,
  noForecastReason: "No analyst consensus forecast available for this series.",
};

describe("IndicatorChart", () => {
  it("shows the no-forecast message when forecast is null", () => {
    render(<IndicatorChart viewModel={base} />);
    expect(screen.getByText(/no analyst consensus forecast/i)).toBeInTheDocument();
  });

  it("shows the forecast value and source when present", () => {
    render(
      <IndicatorChart
        viewModel={{
          ...base,
          forecast: {
            asOf: "2025-12-19",
            horizon: "2026-12-31",
            value: 0.6,
            sourceUrl: "https://example.org/forecast",
            sourceLabel: "Test Source",
          },
          noForecastReason: null,
        }}
      />,
    );
    expect(screen.getByText(/Test Source/)).toBeInTheDocument();
  });

  it("shows the forecast's low/high range when present, rather than discarding it", () => {
    render(
      <IndicatorChart
        viewModel={{
          ...base,
          displayFormat: "integer",
          forecast: {
            asOf: "2026-01-06",
            horizon: "2026-12-31",
            value: 7600,
            valueLow: 7100,
            valueHigh: 8100,
            sourceUrl: "https://example.org/forecast",
            sourceLabel: "Reuters poll",
          },
          noForecastReason: null,
        }}
      />,
    );
    expect(screen.getByText(/7,100/)).toBeInTheDocument();
    expect(screen.getByText(/8,100/)).toBeInTheDocument();
  });

  it("shows the inverted annotation when inverted is true", () => {
    render(<IndicatorChart viewModel={{ ...base, inverted: true }} />);
    expect(screen.getByText(/higher = weaker/i)).toBeInTheDocument();
  });

  it("does not show the inverted annotation when inverted is false", () => {
    render(<IndicatorChart viewModel={base} />);
    expect(screen.queryByText(/higher = weaker/i)).not.toBeInTheDocument();
  });

  it("shows the proxy badge whenever content.isProxy is true", () => {
    render(
      <IndicatorChart
        viewModel={{
          ...base,
          content: { ...base.content, isProxy: true, proxyExplanation: "substitute" },
        }}
      />,
    );
    expect(screen.getByText(/proxy series/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run test to verify it fails, then implement**

```tsx
// src/components/IndicatorChart.tsx
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  Brush,
  ResponsiveContainer,
} from "recharts";
import type { IndicatorDetailViewModel } from "@/lib/view-model";
import { ProxyBadge } from "./ProxyBadge";
import { formatValue } from "@/lib/format";

export function IndicatorChart({ viewModel }: { viewModel: IndicatorDetailViewModel }) {
  const { content, observations, recessionPeriods, inverted, displayFormat, forecast, noForecastReason } =
    viewModel;

  return (
    <div>
      <h2>{content.title}</h2>
      {content.isProxy && (
        <ProxyBadge
          explanation={content.proxyExplanation ?? ""}
          methodologyUrl={content.proxyMethodologyUrl}
        />
      )}
      {inverted && <p>Note: higher = weaker (this indicator is counter-cyclical)</p>}

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={observations}>
          <XAxis dataKey="date" />
          <YAxis
            tickFormatter={(v: number) => formatValue(v, displayFormat)}
          />
          <Tooltip formatter={(v: number) => formatValue(v, displayFormat)} />
          {recessionPeriods.map((period) => (
            <ReferenceArea
              key={period.startDate}
              x1={period.startDate}
              x2={period.endDate}
              fill="currentColor"
              fillOpacity={0.1}
            />
          ))}
          <Line type="monotone" dataKey="value" dot={false} />
          <Brush dataKey="date" height={24} />
        </LineChart>
      </ResponsiveContainer>

      {forecast ? (
        <p>
          Forecast: {formatValue(forecast.value, displayFormat)}
          {forecast.valueLow != null && forecast.valueHigh != null && (
            <> (range: {formatValue(forecast.valueLow, displayFormat)}–
              {formatValue(forecast.valueHigh, displayFormat)})</>
          )}{" "}
          by {forecast.horizon} (source: {forecast.sourceLabel})
        </p>
      ) : (
        <p>{noForecastReason}</p>
      )}
    </div>
  );
}
```

Run: `npx vitest run src/components/IndicatorChart.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 9: Wire up `src/app/indicators/[id]/page.tsx`**

```tsx
// src/app/indicators/[id]/page.tsx
import { getAppDb } from "@/lib/app-db";
import { buildIndicatorDetailViewModel } from "@/lib/view-model";
import { IndicatorChart } from "@/components/IndicatorChart";

export default async function IndicatorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewModel = buildIndicatorDetailViewModel(getAppDb(), id);
  return (
    <main>
      <IndicatorChart viewModel={viewModel} />
    </main>
  );
}
```

- [ ] **Step 10: Verify the app still builds**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 11: Commit**

```bash
git add src/lib/view-model.ts src/lib/view-model.test.ts src/components/ProxyBadge.tsx src/components/ProxyBadge.test.tsx src/components/IndicatorChart.tsx src/components/IndicatorChart.test.tsx src/app/indicators
git commit -m "Add indicator detail page with recession shading, forecast overlay, and proxy/inverted annotations"
```

---

## Task 13: Health check route

**Files:**
- Create: `src/lib/health.ts`
- Test: `src/lib/health.test.ts`
- Create: `src/app/api/health/route.ts`

**Interfaces:**
- Consumes: `INDICATOR_REGISTRY` (Task 3). Queries the `refresh_log` table directly via `db.prepare(...)` rather than through `getRefreshLog` (Task 2) — `getRefreshLog` is scoped to one indicator, while health status needs the most recent entry across all indicators.
- Produces:
  - `interface HealthStatus { status: "ok" | "degraded"; indicatorCount: number; lastRefreshAt: string | null }`
  - `getHealthStatus(db): HealthStatus`

- [ ] **Step 1: Write the failing health test**

```ts
// src/lib/health.test.ts
import { describe, it, expect } from "vitest";
import { openDb, logRefresh } from "./db";
import { getHealthStatus } from "./health";

describe("getHealthStatus", () => {
  it("is degraded with no lastRefreshAt when nothing has ever run", () => {
    const db = openDb(":memory:");
    const status = getHealthStatus(db);
    expect(status.status).toBe("degraded");
    expect(status.lastRefreshAt).toBeNull();
    expect(status.indicatorCount).toBe(11);
  });

  it("is ok with a lastRefreshAt once at least one refresh has logged", () => {
    const db = openDb(":memory:");
    logRefresh(db, "sp500", "ok");
    const status = getHealthStatus(db);
    expect(status.status).toBe("ok");
    expect(status.lastRefreshAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails, then implement**

```ts
// src/lib/health.ts
import type Database from "better-sqlite3";
import { INDICATOR_REGISTRY } from "./indicator-registry";

export interface HealthStatus {
  status: "ok" | "degraded";
  indicatorCount: number;
  lastRefreshAt: string | null;
}

export function getHealthStatus(db: Database.Database): HealthStatus {
  const row = db
    .prepare("SELECT run_at as runAt FROM refresh_log ORDER BY run_at DESC LIMIT 1")
    .get() as { runAt: string } | undefined;

  return {
    status: row ? "ok" : "degraded",
    indicatorCount: INDICATOR_REGISTRY.length,
    lastRefreshAt: row?.runAt ?? null,
  };
}
```

Run: `npx vitest run src/lib/health.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 3: Write `src/app/api/health/route.ts`**

```ts
// src/app/api/health/route.ts
import { NextResponse } from "next/server";
import { getAppDb } from "@/lib/app-db";
import { getHealthStatus } from "@/lib/health";

export async function GET() {
  const status = getHealthStatus(getAppDb());
  return NextResponse.json(status, {
    status: status.status === "ok" ? 200 : 503,
  });
}
```

- [ ] **Step 4: Verify the app still builds**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 5: Commit**

```bash
git add src/lib/health.ts src/lib/health.test.ts src/app/api/health/route.ts
git commit -m "Add health check endpoint for container smoke testing"
```

---

## Task 14: Docker packaging

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

- [ ] **Step 1: Write `.dockerignore`**

```
node_modules
.next
.git
.data
docs
*.test.ts
*.test.tsx
```

- [ ] **Step 2: Write `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/content ./content
COPY --from=build /app/instrumentation.ts ./instrumentation.ts
VOLUME /data
EXPOSE 3000
CMD ["npm", "run", "start"]
```

- [ ] **Step 3: Write `docker-compose.yml`**

```yaml
services:
  dashboard:
    build: .
    ports:
      - "3000:3000"
    environment:
      - FRED_API_KEY=${FRED_API_KEY}
      - DATA_DIR=/data
    volumes:
      - econ-data:/data
    restart: unless-stopped

volumes:
  econ-data:
```

- [ ] **Step 4: Build the image**

Run: `docker build -t econ-dashboard .`
Expected: builds successfully with no errors.

- [ ] **Step 5: Run the smoke test**

Run:
```bash
FRED_API_KEY=smoke-test-key docker compose up -d
sleep 5
curl -sf http://localhost:3000/api/health
docker compose down
```
Expected: `curl` returns JSON with `"indicatorCount":11` (status may legitimately be `"degraded"` on first boot before any real FRED key triggers a successful refresh — that is correct per the design, not a failure).

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "Add Docker packaging with health-check smoke test"
```
