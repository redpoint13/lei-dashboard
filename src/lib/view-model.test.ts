// src/lib/view-model.test.ts
import { describe, it, expect } from "vitest";
import { openDb, upsertObservations, seedIndicators, upsertRecessionPeriods } from "./db";
import { INDICATOR_REGISTRY } from "./indicator-registry";
import { buildDashboardViewModel, buildIndicatorDetailViewModel } from "./view-model";
import { applyCuratedForecasts } from "./forecasts";

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

  it("caps recentObservations at 24 points even with much longer history", () => {
    const db = openDb(":memory:");
    seedIndicators(db, INDICATOR_REGISTRY);
    const dates = Array.from({ length: 40 }, (_, i) =>
      new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
    );
    upsertObservations(
      db,
      "sp500",
      dates.map((date, i) => ({ date, value: 6000 + i })),
    );

    const viewModel = buildDashboardViewModel(db, new Date("2026-02-15T00:00:00.000Z"));

    const sp500Card = viewModel.cards.find((c) => c.id === "sp500")!;
    expect(sp500Card.recentObservations).toHaveLength(24);
    expect(sp500Card.recentObservations[0].date).toBe("2026-01-17");
    expect(sp500Card.recentObservations[23].date).toBe("2026-02-09");
  });
});

describe("buildIndicatorDetailViewModel", () => {
  it("attaches a computed forecast for rate_spread", () => {
    const db = openDb(":memory:");
    seedIndicators(db, INDICATOR_REGISTRY);
    applyCuratedForecasts(db);
    const detail = buildIndicatorDetailViewModel(db, "rate_spread");
    expect(detail.forecast).not.toBeNull();
    expect(detail.noForecastReason).toBeNull();
  });

  it("attaches a curated forecast for sp500", () => {
    const db = openDb(":memory:");
    seedIndicators(db, INDICATOR_REGISTRY);
    applyCuratedForecasts(db);
    const detail = buildIndicatorDetailViewModel(db, "sp500");
    expect(detail.forecast).not.toBeNull();
  });

  it("gives an explicit reason instead of a forecast for the other 8 series", () => {
    const db = openDb(":memory:");
    seedIndicators(db, INDICATOR_REGISTRY);
    applyCuratedForecasts(db); // even with forecasts applied, this series has none
    const detail = buildIndicatorDetailViewModel(db, "avg_weekly_hours_mfg");
    expect(detail.forecast).toBeNull();
    expect(detail.noForecastReason).toMatch(/no analyst consensus forecast/i);
  });

  it("includes recession periods and the indicator's observations", () => {
    const db = openDb(":memory:");
    seedIndicators(db, INDICATOR_REGISTRY);
    upsertObservations(db, "sp500", [{ date: "2026-01-01", value: 6090.1 }]);
    upsertRecessionPeriods(db, [{ startDate: "2020-02-01", endDate: "2020-04-01" }]);
    const detail = buildIndicatorDetailViewModel(db, "sp500");
    expect(detail.observations).toEqual([{ date: "2026-01-01", value: 6090.1 }]);
    expect(detail.recessionPeriods).toEqual([{ startDate: "2020-02-01", endDate: "2020-04-01" }]);
  });
});
