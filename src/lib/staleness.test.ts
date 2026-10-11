import { describe, it, expect } from "vitest";
import { isStale } from "./staleness";

describe("isStale", () => {
  const now = new Date("2026-06-15T00:00:00.000Z");

  it("daily series is stale after 5+ days with no update", () => {
    expect(isStale("daily", "2026-06-09", now)).toBe(true);
    expect(isStale("daily", "2026-06-11", now)).toBe(false);
  });

  it("weekly series is stale after 3+ weeks with no update", () => {
    expect(isStale("weekly", "2026-05-24", now)).toBe(true);
    expect(isStale("weekly", "2026-06-01", now)).toBe(false);
  });

  it("monthly series is stale after 45+ days with no update", () => {
    expect(isStale("monthly", "2026-04-20", now)).toBe(true);
    expect(isStale("monthly", "2026-05-15", now)).toBe(false);
  });
});
