import type Database from "better-sqlite3";
import { hasObservationsFor, getLastSuccessfulRefreshAt } from "./db";
import type { IndicatorDef } from "./db";

/**
 * Decides whether the refresh job should run immediately at boot, instead
 * of waiting up to a full `intervalMs` for the next scheduled tick.
 *
 * Runs immediately when EITHER:
 *  (a) any FRED-backed indicator in the registry has no observations yet
 *      (a true cold start for that series, or a previous run that never
 *      got far enough to populate it), or
 *  (b) the most recent successful ("ok") row in refresh_log is older than
 *      the refresh interval — this covers a container that restarts daily:
 *      `setInterval` restarts its clock on every boot, so without this
 *      check a redeployed container would never reach its first real
 *      scheduled refresh.
 *
 * Checking per-indicator (rather than "does the database have any
 * observations at all") matters because curated data (manual observations,
 * forecasts) can populate the database on every boot independently of FRED
 * (see run-refresh-cycle.ts) — once that happens, a whole-database "any
 * observations" check never looks empty again, even if every FRED-backed
 * indicator is still missing data.
 */
export function computeShouldRunImmediately(
  db: Database.Database,
  registry: IndicatorDef[],
  intervalMs: number,
  now: Date = new Date(),
): boolean {
  const missingFredBackedIndicator = registry.some(
    (indicator) => indicator.fredSeries && !hasObservationsFor(db, indicator.id),
  );
  if (missingFredBackedIndicator) return true;

  const lastSuccessfulRefreshAt = getLastSuccessfulRefreshAt(db);
  if (lastSuccessfulRefreshAt === null) return true;

  const elapsedMs = now.getTime() - new Date(lastSuccessfulRefreshAt).getTime();
  return elapsedMs >= intervalMs;
}

export function startScheduler(options: {
  shouldRunImmediately: () => boolean;
  intervalMs: number;
  runNow: () => Promise<void>;
}): { stop: () => void } {
  const { shouldRunImmediately, intervalMs, runNow } = options;

  const safeRunNow = () => {
    runNow().catch((error) => {
      console.error("Scheduled refresh run failed:", error);
    });
  };

  if (shouldRunImmediately()) {
    safeRunNow();
  }

  const timer = setInterval(() => {
    safeRunNow();
  }, intervalMs);

  return {
    stop: () => clearInterval(timer),
  };
}
