// src/lib/forecasts.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { upsertForecast } from "./db";

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

export function applyCuratedForecasts(db: Database.Database): void {
  const rateSpread = loadRateSpreadForecast();
  if (rateSpread) {
    upsertForecast(db, { indicatorId: "rate_spread", ...rateSpread });
  }

  const sp500 = loadSp500Forecast();
  upsertForecast(db, { indicatorId: "sp500", ...sp500 });
}
