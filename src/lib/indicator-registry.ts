// src/lib/indicator-registry.ts
import type { IndicatorDef } from "./db";

/**
 * Whether `id` is a valid indicator id for the detail page
 * (`/indicators/[id]`). "headline" is excluded — it has its own card on the
 * dashboard but no detail page of its own.
 *
 * Callers must check this BEFORE any file I/O or DB query for the id, so an
 * unknown/garbage id produces a 404 instead of a non-null-assertion crash
 * (500).
 */
export function isValidDetailIndicatorId(id: string): boolean {
  return id !== "headline" && INDICATOR_REGISTRY.some((indicator) => indicator.id === id);
}

export const INDICATOR_REGISTRY: IndicatorDef[] = [
  {
    id: "avg_weekly_hours_mfg",
    leiComponent: 1,
    fredSeries: "AWHMAN",
    isProxy: false,
    proxyNote: null,
    frequency: "monthly",
    units: "Hours",
    inverted: false,
    displayFormat: "decimal_1dp",
  },
  {
    id: "initial_claims",
    leiComponent: 2,
    fredSeries: "ICSA",
    isProxy: false,
    proxyNote: null,
    frequency: "weekly",
    units: "Number",
    inverted: true,
    displayFormat: "integer",
  },
  {
    id: "consumer_goods_orders",
    leiComponent: 3,
    fredSeries: "ACOGNO",
    isProxy: true,
    proxyNote:
      "Consumer goods portion only. The Conference Board's own component is an internal estimate with no single public series to fully replicate (confirmed via their Feb 2026 LEI Technical Notes).",
    frequency: "monthly",
    units: "Millions of Dollars",
    inverted: false,
    displayFormat: "usd_millions",
  },
  {
    id: "ism_new_orders",
    leiComponent: 4,
    fredSeries: null,
    isProxy: true,
    proxyNote:
      "ISM licenses this series; no free API exists. Value is manually transcribed monthly from ISM's free press-release headline.",
    frequency: "monthly",
    units: "Index (50 = neutral)",
    inverted: false,
    displayFormat: "decimal_1dp",
  },
  {
    id: "capital_goods_orders",
    leiComponent: 5,
    fredSeries: "NEWORDER",
    isProxy: false,
    proxyNote: null,
    frequency: "monthly",
    units: "Millions of Dollars",
    inverted: false,
    displayFormat: "usd_millions",
  },
  {
    id: "building_permits",
    leiComponent: 6,
    fredSeries: "PERMIT",
    isProxy: false,
    proxyNote: null,
    frequency: "monthly",
    units: "Thousands of Units",
    inverted: false,
    displayFormat: "decimal_0dp",
  },
  {
    id: "sp500",
    leiComponent: 7,
    fredSeries: "SP500",
    isProxy: false,
    proxyNote: null,
    frequency: "daily",
    units: "Index",
    inverted: false,
    displayFormat: "points_2dp",
  },
  {
    id: "leading_credit_index",
    leiComponent: 8,
    fredSeries: "NFCI",
    isProxy: true,
    proxyNote:
      "The Conference Board's Leading Credit Index is proprietary with no free equivalent. The Chicago Fed's National Financial Conditions Index (NFCI) measures similar credit/financial conditions but is not the official LCI.",
    frequency: "weekly",
    units: "Standard Deviations from Average",
    inverted: true,
    displayFormat: "decimal_2dp",
  },
  {
    id: "rate_spread",
    leiComponent: 9,
    fredSeries: "T10YFF",
    isProxy: false,
    proxyNote: null,
    frequency: "daily",
    units: "Percentage Points",
    inverted: false,
    displayFormat: "decimal_2dp",
  },
  {
    id: "consumer_expectations",
    leiComponent: 10,
    fredSeries: "UMCSENT",
    isProxy: true,
    proxyNote:
      "The Michigan survey's standalone 'Index of Consumer Expectations' sub-index isn't published as its own free FRED series; UMCSENT (overall Consumer Sentiment, which blends current conditions with expectations) is the closest free proxy.",
    frequency: "monthly",
    units: "Index (1966 Q1=100)",
    inverted: false,
    displayFormat: "decimal_1dp",
  },
  {
    id: "headline",
    leiComponent: null,
    fredSeries: null,
    isProxy: false,
    proxyNote: null,
    frequency: "monthly",
    units: "Index (2016=100)",
    inverted: false,
    displayFormat: "decimal_1dp",
  },
];
