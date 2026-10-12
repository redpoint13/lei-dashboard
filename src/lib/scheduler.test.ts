import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startScheduler, computeShouldRunImmediately } from "./scheduler";
import { openDb, seedIndicators, upsertObservations, logRefresh } from "./db";
import type { IndicatorDef } from "./db";

describe("startScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs immediately when shouldRunImmediately() returns true", async () => {
    const runNow = vi.fn().mockResolvedValue(undefined);
    const handle = startScheduler({
      shouldRunImmediately: () => true,
      intervalMs: 1000,
      runNow,
    });
    await vi.waitFor(() => expect(runNow).toHaveBeenCalledTimes(1));
    handle.stop();
  });

  it("does not run immediately when shouldRunImmediately() returns false", () => {
    const runNow = vi.fn().mockResolvedValue(undefined);
    const handle = startScheduler({
      shouldRunImmediately: () => false,
      intervalMs: 1000,
      runNow,
    });
    expect(runNow).not.toHaveBeenCalled();
    handle.stop();
  });

  it("runs again after each interval elapses, regardless of the immediate-run decision", async () => {
    const runNow = vi.fn().mockResolvedValue(undefined);
    const handle = startScheduler({
      shouldRunImmediately: () => false,
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
      shouldRunImmediately: () => false,
      intervalMs: 1000,
      runNow,
    });
    handle.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(runNow).not.toHaveBeenCalled();
  });

  it("a rejected runNow does not crash and does not stop the recurring interval", async () => {
    const runNow = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient upstream failure"))
      .mockResolvedValue(undefined);
    const handle = startScheduler({
      shouldRunImmediately: () => false,
      intervalMs: 1000,
      runNow,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(runNow).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runNow).toHaveBeenCalledTimes(2);
    handle.stop();
  });
});

const registry: IndicatorDef[] = [
  {
    id: "fred_a",
    leiComponent: 1,
    fredSeries: "SERIES_A",
    isProxy: false,
    proxyNote: null,
    frequency: "monthly",
    units: "x",
    inverted: false,
    displayFormat: "decimal_1dp",
  },
  {
    id: "fred_b",
    leiComponent: 2,
    fredSeries: "SERIES_B",
    isProxy: false,
    proxyNote: null,
    frequency: "monthly",
    units: "x",
    inverted: false,
    displayFormat: "decimal_1dp",
  },
  {
    id: "manual_only",
    leiComponent: 4,
    fredSeries: null,
    isProxy: true,
    proxyNote: null,
    frequency: "monthly",
    units: "x",
    inverted: false,
    displayFormat: "decimal_1dp",
  },
];

describe("computeShouldRunImmediately", () => {
  const intervalMs = 24 * 60 * 60 * 1000;

  it("returns true when a FRED-backed indicator has no observations yet", () => {
    const db = openDb(":memory:");
    seedIndicators(db, registry);
    upsertObservations(db, "fred_a", [{ date: "2026-01-01", value: 1 }]);
    // fred_b has never been populated.
    logRefresh(db, "fred_a", "ok");
    expect(computeShouldRunImmediately(db, registry, intervalMs)).toBe(true);
  });

  it("does not require manual-only indicators (no fredSeries) to have observations", () => {
    const db = openDb(":memory:");
    seedIndicators(db, registry);
    upsertObservations(db, "fred_a", [{ date: "2026-01-01", value: 1 }]);
    upsertObservations(db, "fred_b", [{ date: "2026-01-01", value: 1 }]);
    logRefresh(db, "fred_a", "ok");
    // manual_only has no observations, but it has no fredSeries, so it must
    // not force an immediate run on its own.
    expect(computeShouldRunImmediately(db, registry, intervalMs)).toBe(false);
  });

  it("returns true when there has never been a successful refresh logged, even if data exists", () => {
    const db = openDb(":memory:");
    seedIndicators(db, registry);
    upsertObservations(db, "fred_a", [{ date: "2026-01-01", value: 1 }]);
    upsertObservations(db, "fred_b", [{ date: "2026-01-01", value: 1 }]);
    expect(computeShouldRunImmediately(db, registry, intervalMs)).toBe(true);
  });

  it("returns false when all FRED-backed indicators have data and the last successful refresh is within the interval", () => {
    const db = openDb(":memory:");
    seedIndicators(db, registry);
    upsertObservations(db, "fred_a", [{ date: "2026-01-01", value: 1 }]);
    upsertObservations(db, "fred_b", [{ date: "2026-01-01", value: 1 }]);
    const now = new Date("2026-06-15T12:00:00.000Z");
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const db2 = db
      .prepare("INSERT INTO refresh_log (indicator_id, run_at, status, detail) VALUES (?, ?, ?, ?)")
      .run("fred_a", twelveHoursAgo.toISOString(), "ok", null);
    expect(db2.changes).toBe(1);
    expect(computeShouldRunImmediately(db, registry, intervalMs, now)).toBe(false);
  });

  it("returns true when the last successful refresh is older than the interval — a container restarting daily must not wait another full interval", () => {
    const db = openDb(":memory:");
    seedIndicators(db, registry);
    upsertObservations(db, "fred_a", [{ date: "2026-01-01", value: 1 }]);
    upsertObservations(db, "fred_b", [{ date: "2026-01-01", value: 1 }]);
    const now = new Date("2026-06-15T12:00:00.000Z");
    const twoDaysAgo = new Date(now.getTime() - 2 * intervalMs);
    db.prepare(
      "INSERT INTO refresh_log (indicator_id, run_at, status, detail) VALUES (?, ?, ?, ?)",
    ).run("fred_a", twoDaysAgo.toISOString(), "ok", null);
    expect(computeShouldRunImmediately(db, registry, intervalMs, now)).toBe(true);
  });
});
