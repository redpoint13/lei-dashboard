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

export function getRecentObservations(
  db: Database.Database,
  indicatorId: string,
  limit: number,
): { date: string; value: number }[] {
  const rows = db
    .prepare(
      "SELECT date, value FROM observations WHERE indicator_id = ? ORDER BY date DESC LIMIT ?",
    )
    .all(indicatorId, limit) as { date: string; value: number }[];
  return rows.reverse();
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

export function getLastSuccessfulRefreshAt(db: Database.Database): string | null {
  const row = db
    .prepare(
      "SELECT run_at as runAt FROM refresh_log WHERE status = 'ok' ORDER BY run_at DESC LIMIT 1",
    )
    .get() as { runAt: string } | undefined;
  return row?.runAt ?? null;
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
