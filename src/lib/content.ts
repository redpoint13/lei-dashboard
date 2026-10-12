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

/**
 * Loads a curated JSON file with the override-then-repo-default fallback
 * behavior shared by all curated content types: prefer the file at
 * `DATA_DIR/curated/<overrideRelativePath>` (writable on the mounted
 * volume, no image rebuild needed), falling back to the repo-committed
 * default at `<repo>/content/<defaultRelativePath>` when the override is
 * missing, unparseable, OR fails the shape check in `isValid`.
 *
 * The shape check matters as much as the parse check: a syntactically
 * valid override with the wrong field types (e.g. a number field holding a
 * string) must fail only its own card, not crash whatever downstream code
 * assumes the documented shape (e.g. a bare `.toFixed()` call).
 */
export function loadCuratedJson<T>(
  overrideRelativePath: string,
  defaultRelativePath: string,
  isValid: (value: unknown) => value is T,
): T {
  const overridePath = path.join(getDataDir(), "curated", overrideRelativePath);
  const defaultPath = path.join(process.cwd(), "content", defaultRelativePath);

  if (existsSync(overridePath)) {
    try {
      const parsed = JSON.parse(readFileSync(overridePath, "utf-8"));
      if (!isValid(parsed)) {
        throw new Error(`Override content at ${overridePath} has an unexpected shape`);
      }
      return parsed;
    } catch (err) {
      console.error(
        `Malformed curated content at ${overridePath}, falling back to default:`,
        err,
      );
    }
  }
  return JSON.parse(readFileSync(defaultPath, "utf-8")) as T;
}

function isIndicatorContent(value: unknown): value is IndicatorContent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.title === "string" &&
    typeof v.whatItMeasures === "string" &&
    typeof v.whatItPredicts === "string" &&
    typeof v.sourceName === "string" &&
    typeof v.sourceUrl === "string" &&
    typeof v.isProxy === "boolean"
  );
}

function isHeadlineContent(value: unknown): value is HeadlineContent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.indexLevel === "number" &&
    typeof v.momPercentChange === "number" &&
    typeof v.sixMonthAnnualizedGrowth === "number" &&
    typeof v.asOf === "string"
  );
}

export function loadIndicatorContent(id: string): IndicatorContent {
  return loadCuratedJson(
    `${id}.json`,
    path.join("indicators", `${id}.json`),
    isIndicatorContent,
  );
}

export function loadHeadlineContent(): HeadlineContent {
  return loadCuratedJson("headline.json", "headline.json", isHeadlineContent);
}

type ManualObservation = { date: string; value: number };

/** Returns the observations, or null if the file is missing or unparseable. */
function readManualObservations(filePath: string): ManualObservation[] | null {
  if (!existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as {
      observations: ManualObservation[];
    };
    return parsed.observations;
  } catch (err) {
    console.error(`Malformed manual observations at ${filePath}:`, err);
    return null;
  }
}

export function loadManualObservations(id: string): ManualObservation[] {
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
  return (
    readManualObservations(overridePath) ??
    readManualObservations(defaultPath) ??
    []
  );
}
