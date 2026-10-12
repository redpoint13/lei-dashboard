export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getAppDb } = await import("./lib/app-db");
  const { seedIndicators } = await import("./lib/db");
  const { INDICATOR_REGISTRY } = await import("./lib/indicator-registry");
  const { runRefreshCycle } = await import("./lib/run-refresh-cycle");
  const { startScheduler, computeShouldRunImmediately } = await import("./lib/scheduler");

  const db = getAppDb();
  seedIndicators(db, INDICATOR_REGISTRY);

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    console.error(
      "FRED_API_KEY is not set — the refresh job will not run. Set it in the environment.",
    );
    return;
  }

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  startScheduler({
    shouldRunImmediately: () =>
      computeShouldRunImmediately(db, INDICATOR_REGISTRY, ONE_DAY_MS),
    intervalMs: ONE_DAY_MS,
    runNow: () => runRefreshCycle(db, INDICATOR_REGISTRY, apiKey),
  });
}
