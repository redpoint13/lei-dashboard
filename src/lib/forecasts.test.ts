// src/lib/forecasts.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  computeRateSpreadForecast,
  loadRateSpreadForecast,
  loadSp500Forecast,
  applyCuratedForecasts,
} from "./forecasts";
import { openDb, getLatestForecast } from "./db";

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

describe("curated-volume override for forecasts", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "econ-forecast-override-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("loadSp500Forecast prefers an override file on the mounted volume path", () => {
    vi.stubEnv("DATA_DIR", dataDir);
    mkdirSync(path.join(dataDir, "curated", "forecasts"), { recursive: true });
    writeFileSync(
      path.join(dataDir, "curated", "forecasts", "sp500.json"),
      JSON.stringify({
        asOf: "2026-02-01",
        horizon: "2026-12-31",
        value: 1234,
        sourceUrl: "https://example.org",
        sourceLabel: "Overridden source",
      }),
    );
    expect(loadSp500Forecast().value).toBe(1234);
  });

  it("loadRateSpreadForecast prefers an override file on the mounted volume path", () => {
    vi.stubEnv("DATA_DIR", dataDir);
    mkdirSync(path.join(dataDir, "curated", "forecasts"), { recursive: true });
    writeFileSync(
      path.join(dataDir, "curated", "forecasts", "rate-spread-inputs.json"),
      JSON.stringify({
        fedFunds: {
          asOf: "2026-01-01",
          horizon: "2027-12-31",
          value: 2,
          sourceUrl: "https://example.org/fed",
          sourceLabel: "Overridden Fed",
        },
        treasury10yr: {
          asOf: "2026-01-02",
          horizon: "2027-12-31",
          value: 5,
          sourceUrl: "https://example.org/treasury",
          sourceLabel: "Overridden Treasury",
        },
      }),
    );
    expect(loadRateSpreadForecast()?.value).toBeCloseTo(3, 5);
  });

  it("falls back to the repo default when the forecast override has the wrong shape", () => {
    vi.stubEnv("DATA_DIR", dataDir);
    mkdirSync(path.join(dataDir, "curated", "forecasts"), { recursive: true });
    writeFileSync(
      path.join(dataDir, "curated", "forecasts", "sp500.json"),
      JSON.stringify({ value: "not a number" }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(loadSp500Forecast().value).toBe(7600); // repo default from content/forecasts/sp500.json
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
