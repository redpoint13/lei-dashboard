// src/lib/db.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  openDb,
  upsertObservations,
  getObservations,
  getLatestObservation,
  hasObservationsFor,
  hasAnyObservations,
  logRefresh,
  getRefreshLog,
  upsertRecessionPeriods,
  getRecessionPeriods,
  upsertForecast,
  getLatestForecast,
  seedIndicators,
} from "./db";
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

  it("getLatestObservation returns the most recent row, or null when empty", () => {
    const db = freshDb();
    expect(getLatestObservation(db, "sp500")).toBeNull();
    upsertObservations(db, "sp500", [
      { date: "2026-01-01", value: 6090.1 },
      { date: "2026-01-02", value: 6100.5 },
    ]);
    expect(getLatestObservation(db, "sp500")).toEqual({
      date: "2026-01-02",
      value: 6100.5,
    });
  });
});

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
