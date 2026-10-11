// src/lib/view-model.ts
import type Database from "better-sqlite3";
import { getLatestObservation, getObservations } from "./db";
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
