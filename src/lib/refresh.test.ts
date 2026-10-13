// src/lib/refresh.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  refreshAll,
  refreshRecessionPeriods,
  applyManualObservations,
} from "./refresh";
import {
  openDb,
  getObservations,
  getRefreshLog,
  getRecessionPeriods,
  upsertObservations,
} from "./db";
import type { IndicatorDef } from "./db";

const registry: IndicatorDef[] = [
  { id: "a", leiComponent: 1, fredSeries: "SERIES_A", isProxy: false, proxyNote: null, frequency: "monthly", units: "x", inverted: false, displayFormat: "decimal_1dp" },
  { id: "b", leiComponent: 2, fredSeries: "SERIES_B", isProxy: false, proxyNote: null, frequency: "monthly", units: "x", inverted: false, displayFormat: "decimal_1dp" },
  { id: "headline", leiComponent: null, fredSeries: null, isProxy: false, proxyNote: null, frequency: "monthly", units: "x", inverted: false, displayFormat: "decimal_1dp" },
  { id: "ism_new_orders", leiComponent: 4, fredSeries: null, isProxy: true, proxyNote: null, frequency: "monthly", units: "x", inverted: false, displayFormat: "decimal_1dp" },
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

  it("captures a trailing open recession period when the series ends still at value 1", async () => {
    const db = openDb(":memory:");
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        observations: [
          { date: "2020-01-01", value: "0" },
          { date: "2020-02-01", value: "1" },
          { date: "2020-03-01", value: "1" },
          // no closing "0" — the series ends while still in recession
        ],
      }),
    }) as unknown as typeof fetch;

    await refreshRecessionPeriods(db, "key", fetchImpl);

    expect(getRecessionPeriods(db)).toEqual([
      { startDate: "2020-02-01", endDate: "2020-03-01" },
    ]);
  });
});

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
