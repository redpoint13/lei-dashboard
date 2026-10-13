// src/lib/health.ts
import type Database from "better-sqlite3";
import { INDICATOR_REGISTRY } from "./indicator-registry";

export interface HealthStatus {
  status: "ok" | "degraded";
  indicatorCount: number;
  lastRefreshAt: string | null;
}

export function getHealthStatus(db: Database.Database): HealthStatus {
  const row = db
    .prepare("SELECT run_at as runAt FROM refresh_log ORDER BY run_at DESC LIMIT 1")
    .get() as { runAt: string } | undefined;

  return {
    status: row ? "ok" : "degraded",
    indicatorCount: INDICATOR_REGISTRY.length,
    lastRefreshAt: row?.runAt ?? null,
  };
}
