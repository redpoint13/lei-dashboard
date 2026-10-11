// src/lib/forecasts.test.ts
import { describe, it, expect } from "vitest";
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
