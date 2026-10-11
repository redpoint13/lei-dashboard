import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getDataDir } from "./env";

export interface IndicatorContent {
  title: string;
  whatItMeasures: string;
  whatItPredicts: string;
  sourceName: string;
  sourceUrl: string;
  isProxy: boolean;
  proxyExplanation?: string;
  proxyMethodologyUrl?: string;
}

export interface HeadlineContent {
  indexLevel: number;
  momPercentChange: number;
  sixMonthAnnualizedGrowth: number;
  asOf: string;
  recessionSignalCommentary?: string;
}

function loadJsonWithFallback<T>(
  overridePath: string,
  defaultPath: string,
): T {
  if (existsSync(overridePath)) {
    try {
      return JSON.parse(readFileSync(overridePath, "utf-8")) as T;
    } catch (err) {
      console.error(
        `Malformed curated content at ${overridePath}, falling back to default:`,
        err,
      );
    }
  }
  return JSON.parse(readFileSync(defaultPath, "utf-8")) as T;
}

export function loadIndicatorContent(id: string): IndicatorContent {
  const overridePath = path.join(getDataDir(), "curated", `${id}.json`);
  const defaultPath = path.join(
    process.cwd(),
    "content",
    "indicators",
    `${id}.json`,
  );
  return loadJsonWithFallback<IndicatorContent>(overridePath, defaultPath);
}

export function loadHeadlineContent(): HeadlineContent {
  const overridePath = path.join(getDataDir(), "curated", "headline.json");
  const defaultPath = path.join(process.cwd(), "content", "headline.json");
  return loadJsonWithFallback<HeadlineContent>(overridePath, defaultPath);
}

export function loadManualObservations(
  id: string,
): { date: string; value: number }[] {
  const overridePath = path.join(
    getDataDir(),
    "curated",
    "manual-observations",
    `${id}.json`,
  );
  const defaultPath = path.join(
    process.cwd(),
    "content",
    "manual-observations",
    `${id}.json`,
  );
  const pathToUse = existsSync(overridePath) ? overridePath : defaultPath;
  if (!existsSync(pathToUse)) return [];
  try {
    const parsed = JSON.parse(readFileSync(pathToUse, "utf-8")) as {
      observations: { date: string; value: number }[];
    };
    return parsed.observations;
  } catch (err) {
    console.error(`Malformed manual observations at ${pathToUse}:`, err);
    return [];
  }
}
