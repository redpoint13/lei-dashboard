// src/lib/health.test.ts
import { describe, it, expect } from "vitest";
import { openDb, logRefresh } from "./db";
import { getHealthStatus } from "./health";

describe("getHealthStatus", () => {
  it("is degraded with no lastRefreshAt when nothing has ever run", () => {
    const db = openDb(":memory:");
    const status = getHealthStatus(db);
    expect(status.status).toBe("degraded");
    expect(status.lastRefreshAt).toBeNull();
    expect(status.indicatorCount).toBe(11);
  });

  it("is ok with a lastRefreshAt once at least one refresh has logged", () => {
    const db = openDb(":memory:");
    logRefresh(db, "sp500", "ok");
    const status = getHealthStatus(db);
    expect(status.status).toBe("ok");
    expect(status.lastRefreshAt).not.toBeNull();
  });
});
