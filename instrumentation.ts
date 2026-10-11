export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getAppDb } = await import("./src/lib/app-db");
  const { seedIndicators, hasAnyObservations } = await import("./src/lib/db");
  const { INDICATOR_REGISTRY } = await import("./src/lib/indicator-registry");
  const { refreshAll, refreshRecessionPeriods, applyManualObservations } = await import(
    "./src/lib/refresh"
  );
  const { applyCuratedForecasts } = await import("./src/lib/forecasts");
  const { startScheduler } = await import("./src/lib/scheduler");

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
    hasAnyObservations: () => hasAnyObservations(db),
    intervalMs: ONE_DAY_MS,
    runNow: async () => {
      await refreshAll(db, INDICATOR_REGISTRY, apiKey);
      await refreshRecessionPeriods(db, apiKey);
      applyManualObservations(db, INDICATOR_REGISTRY);
      applyCuratedForecasts(db);
    },
  });
}
