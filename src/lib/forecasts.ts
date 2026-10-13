// src/lib/forecasts.ts
import path from "node:path";
import type Database from "better-sqlite3";
import { upsertForecast } from "./db";
import { loadCuratedJson } from "./content";

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

function isForecastInput(value: unknown): value is ForecastInput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.asOf === "string" &&
    typeof v.horizon === "string" &&
    typeof v.value === "number" &&
    typeof v.sourceUrl === "string" &&
    typeof v.sourceLabel === "string"
  );
}

function isRateSpreadInputs(
  value: unknown,
): value is { fedFunds: ForecastInput; treasury10yr: ForecastInput } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return isForecastInput(v.fedFunds) && isForecastInput(v.treasury10yr);
}

function isForecastValue(value: unknown): value is ForecastValue {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.asOf === "string" &&
    typeof v.horizon === "string" &&
    typeof v.value === "number" &&
    typeof v.sourceUrl === "string" &&
    typeof v.sourceLabel === "string"
  );
}

export function loadRateSpreadForecast(): ForecastValue | null {
  const { fedFunds, treasury10yr } = loadCuratedJson(
    path.join("forecasts", "rate-spread-inputs.json"),
    path.join("forecasts", "rate-spread-inputs.json"),
    isRateSpreadInputs,
  );
  return computeRateSpreadForecast(fedFunds, treasury10yr);
}

export function loadSp500Forecast(): ForecastValue {
  return loadCuratedJson(
    path.join("forecasts", "sp500.json"),
    path.join("forecasts", "sp500.json"),
    isForecastValue,
  );
}

export function applyCuratedForecasts(db: Database.Database): void {
  const rateSpread = loadRateSpreadForecast();
  if (rateSpread) {
    upsertForecast(db, { indicatorId: "rate_spread", ...rateSpread });
  }

  const sp500 = loadSp500Forecast();
  upsertForecast(db, { indicatorId: "sp500", ...sp500 });
}
