// src/lib/refresh.ts
import type Database from "better-sqlite3";
import type { IndicatorDef } from "./db";
import {
  upsertObservations,
  hasObservationsFor,
  logRefresh,
  upsertRecessionPeriods,
} from "./db";
import { fetchFredSeries, FredApiError } from "./fred-client";
import { loadManualObservations } from "./content";

export interface RefreshSummary {
  succeeded: string[];
  failed: { id: string; error: string }[];
}

const ROLLING_WINDOW_DAYS = 180;
const FULL_HISTORY_START = "1900-01-01";

function windowStart(now: Date): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - ROLLING_WINDOW_DAYS);
  return d.toISOString().slice(0, 10);
}

export async function refreshAll(
  db: Database.Database,
  registry: IndicatorDef[],
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<RefreshSummary> {
  const summary: RefreshSummary = { succeeded: [], failed: [] };

  for (const indicator of registry) {
    if (!indicator.fredSeries) continue; // manual-only indicators (e.g. headline)

    const observationStart = hasObservationsFor(db, indicator.id)
      ? windowStart(now)
      : FULL_HISTORY_START;

    try {
      const observations = await fetchFredSeries(
        indicator.fredSeries,
        observationStart,
        apiKey,
        fetchImpl,
      );
      const clean = observations.filter(
        (o): o is { date: string; value: number } => o.value !== null,
      );
      upsertObservations(db, indicator.id, clean);
      logRefresh(db, indicator.id, "ok");
      summary.succeeded.push(indicator.id);
    } catch (err) {
      const message =
        err instanceof FredApiError ? err.message : String(err);
      logRefresh(db, indicator.id, "error", message);
      summary.failed.push({ id: indicator.id, error: message });
    }
  }

  return summary;
}

export async function refreshRecessionPeriods(
  db: Database.Database,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const observations = await fetchFredSeries(
    "USREC",
    FULL_HISTORY_START,
    apiKey,
    fetchImpl,
  );

  const periods: { startDate: string; endDate: string }[] = [];
  let currentStart: string | null = null;
  let previousDate: string | null = null;

  for (const obs of observations) {
    if (obs.value === 1 && currentStart === null) {
      currentStart = obs.date;
    } else if (obs.value !== 1 && currentStart !== null) {
      periods.push({ startDate: currentStart, endDate: previousDate! });
      currentStart = null;
    }
    previousDate = obs.date;
  }
  if (currentStart !== null) {
    periods.push({ startDate: currentStart, endDate: previousDate! });
  }

  upsertRecessionPeriods(db, periods);
}

export function applyManualObservations(
  db: Database.Database,
  registry: IndicatorDef[],
): void {
  for (const indicator of registry) {
    if (indicator.fredSeries !== null || indicator.id === "headline") continue;
    const observations = loadManualObservations(indicator.id);
    if (observations.length > 0) {
      upsertObservations(db, indicator.id, observations);
    }
  }
}
