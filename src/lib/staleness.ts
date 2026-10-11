const THRESHOLD_DAYS: Record<"daily" | "weekly" | "monthly", number> = {
  daily: 5,
  weekly: 21,
  monthly: 45,
};

export function isStale(
  frequency: "daily" | "weekly" | "monthly",
  lastObservedDate: string,
  now: Date,
): boolean {
  const last = new Date(`${lastObservedDate}T00:00:00.000Z`);
  const diffDays = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= THRESHOLD_DAYS[frequency];
}
