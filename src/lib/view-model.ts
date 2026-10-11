// src/lib/view-model.ts
import type Database from "better-sqlite3";
import { getLatestObservation, getObservations, getRecessionPeriods, getLatestForecast } from "./db";
import { INDICATOR_REGISTRY } from "./indicator-registry";
import { loadIndicatorContent, loadHeadlineContent } from "./content";
import type { IndicatorContent, HeadlineContent } from "./content";
import { isStale } from "./staleness";

const SPARKLINE_POINTS = 24;

export interface DashboardCardViewModel {
  id: string;
  content: IndicatorContent;
  latestValue: { date: string; value: number } | null;
  recentObservations: { date: string; value: number }[];
  displayFormat: string;
  inverted: boolean;
  isStale: boolean;
}

export interface DashboardViewModel {
  headline: HeadlineContent;
  cards: DashboardCardViewModel[];
}

export function buildDashboardViewModel(
  db: Database.Database,
  now: Date = new Date(),
): DashboardViewModel {
  const cards = INDICATOR_REGISTRY.filter((indicator) => indicator.id !== "headline").map(
    (indicator) => {
      const latestValue = getLatestObservation(db, indicator.id);
      const recentObservations = getObservations(db, indicator.id).slice(
        -SPARKLINE_POINTS,
      );
      return {
        id: indicator.id,
        content: loadIndicatorContent(indicator.id),
        latestValue,
        recentObservations,
        displayFormat: indicator.displayFormat,
        inverted: indicator.inverted,
        isStale: latestValue
          ? isStale(
              indicator.frequency as "daily" | "weekly" | "monthly",
              latestValue.date,
              now,
            )
          : false,
      };
    },
  );

  return { headline: loadHeadlineContent(), cards };
}

export interface IndicatorDetailViewModel {
  id: string;
  content: IndicatorContent;
  observations: { date: string; value: number }[];
  recessionPeriods: { startDate: string; endDate: string }[];
  inverted: boolean;
  displayFormat: string;
  forecast: {
    asOf: string;
    horizon: string;
    value: number;
    valueLow?: number | null;
    valueHigh?: number | null;
    sourceUrl: string;
    sourceLabel: string;
  } | null;
  noForecastReason: string | null;
}

const NO_FORECAST_REASON =
  "No analyst consensus forecast available for this series — most individual LEI components are inputs to forecasting, not published forecast targets themselves.";

export function buildIndicatorDetailViewModel(
  db: Database.Database,
  id: string,
): IndicatorDetailViewModel {
  const indicator = INDICATOR_REGISTRY.find((i) => i.id === id)!;
  const forecast = getLatestForecast(db, id);
  return {
    id,
    content: loadIndicatorContent(id),
    observations: getObservations(db, id),
    recessionPeriods: getRecessionPeriods(db),
    inverted: indicator.inverted,
    displayFormat: indicator.displayFormat,
    forecast,
    noForecastReason: forecast ? null : NO_FORECAST_REASON,
  };
}
