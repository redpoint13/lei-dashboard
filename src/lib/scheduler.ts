export function startScheduler(options: {
  hasAnyObservations: () => boolean;
  intervalMs: number;
  runNow: () => Promise<void>;
}): { stop: () => void } {
  const { hasAnyObservations, intervalMs, runNow } = options;

  const safeRunNow = () => {
    runNow().catch((error) => {
      console.error("Scheduled refresh run failed:", error);
    });
  };

  if (!hasAnyObservations()) {
    safeRunNow();
  }

  const timer = setInterval(() => {
    safeRunNow();
  }, intervalMs);

  return {
    stop: () => clearInterval(timer),
  };
}
