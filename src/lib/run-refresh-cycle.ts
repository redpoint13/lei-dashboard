// src/lib/run-refresh-cycle.ts
import type Database from "better-sqlite3";
import type { IndicatorDef } from "./db";
import { refreshAll, refreshRecessionPeriods, applyManualObservations } from "./refresh";
import { applyCuratedForecasts } from "./forecasts";

/**
 * Runs one full refresh cycle: FRED-backed series, NBER recession periods,
 * and curated content (manual observations + forecasts).
 *
 * Each step is isolated in its own try/catch. The curated-data steps
 * (applyManualObservations, applyCuratedForecasts) read from local JSON
 * files and have nothing to do with FRED, so a FRED outage, a bad API key,
 * or specifically the USREC recession-period fetch failing must never
 * prevent them from running — otherwise indicators like ism_new_orders
 * would wrongly show "Data unavailable" and sp500/rate_spread would wrongly
 * show "No analyst consensus forecast available" even though curated data
 * for them exists locally.
 */
export async function runRefreshCycle(
  db: Database.Database,
  registry: IndicatorDef[],
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    await refreshAll(db, registry, apiKey, fetchImpl);
  } catch (err) {
    console.error("refreshAll failed:", err);
  }

  try {
    await refreshRecessionPeriods(db, apiKey, fetchImpl);
  } catch (err) {
    console.error("refreshRecessionPeriods failed:", err);
  }

  try {
    applyManualObservations(db, registry);
  } catch (err) {
    console.error("applyManualObservations failed:", err);
  }

  try {
    applyCuratedForecasts(db);
  } catch (err) {
    console.error("applyCuratedForecasts failed:", err);
  }
}
