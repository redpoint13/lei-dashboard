// src/lib/run-refresh-cycle.test.ts
import { describe, it, expect, vi } from "vitest";
import { runRefreshCycle } from "./run-refresh-cycle";
import { openDb, getObservations, getLatestForecast } from "./db";
import { INDICATOR_REGISTRY } from "./indicator-registry";

describe("runRefreshCycle", () => {
  it("still applies curated data (manual observations + forecasts) when the FRED-dependent steps throw", async () => {
    const db = openDb(":memory:");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Every upstream call rejects, so refreshRecessionPeriods (which has no
    // internal try/catch, unlike refreshAll) throws — this is exactly the
    // "USREC fetch fails" scenario from the finding.
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    await runRefreshCycle(db, INDICATOR_REGISTRY, "fake-key", fetchImpl);

    expect(getObservations(db, "ism_new_orders").length).toBeGreaterThan(0);
    expect(getLatestForecast(db, "sp500")).not.toBeNull();
    expect(getLatestForecast(db, "rate_spread")).not.toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("does not throw even when every step fails", async () => {
    const db = openDb(":memory:");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    await expect(
      runRefreshCycle(db, INDICATOR_REGISTRY, "fake-key", fetchImpl),
    ).resolves.toBeUndefined();
    errorSpy.mockRestore();
  });
});
