// src/lib/view-model.test.ts
import { describe, it, expect } from "vitest";
import { openDb, upsertObservations, seedIndicators, upsertRecessionPeriods } from "./db";
import { INDICATOR_REGISTRY } from "./indicator-registry";
import { buildDashboardViewModel } from "./view-model";

describe("buildDashboardViewModel", () => {
  it("includes the headline and one card per non-headline indicator, with data-unavailable for indicators with no observations", () => {
    const db = openDb(":memory:");
    seedIndicators(db, INDICATOR_REGISTRY);
    const now = new Date("2026-06-15T00:00:00.000Z");
    upsertObservations(db, "sp500", [{ date: "2026-06-14", value: 6100.5 }]);

    const viewModel = buildDashboardViewModel(db, now);

    expect(viewModel.cards).toHaveLength(10); // all registry entries except "headline"
    const sp500Card = viewModel.cards.find((c) => c.id === "sp500")!;
    expect(sp500Card.latestValue).toEqual({ date: "2026-06-14", value: 6100.5 });
    expect(sp500Card.recentObservations).toEqual([{ date: "2026-06-14", value: 6100.5 }]);
    expect(sp500Card.isStale).toBe(false);

    const claimsCard = viewModel.cards.find((c) => c.id === "initial_claims")!;
    expect(claimsCard.latestValue).toBeNull();
    expect(claimsCard.inverted).toBe(true);

    expect(viewModel.headline.indexLevel).toBeGreaterThan(0);
  });
});
