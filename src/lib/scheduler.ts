export function startScheduler(options: {
  hasAnyObservations: () => boolean;
  intervalMs: number;
  runNow: () => Promise<void>;
}): { stop: () => void } {
  const { hasAnyObservations, intervalMs, runNow } = options;

  if (!hasAnyObservations()) {
    void runNow();
  }

  const timer = setInterval(() => {
    void runNow();
  }, intervalMs);

  return {
    stop: () => clearInterval(timer),
  };
}
