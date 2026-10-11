// src/lib/content-files.test.ts
import { describe, it, expect } from "vitest";
import { loadIndicatorContent, loadHeadlineContent } from "./content";
import { INDICATOR_REGISTRY } from "./indicator-registry";

describe("curated content files", () => {
  const nonHeadlineIds = INDICATOR_REGISTRY.filter((i) => i.id !== "headline").map(
    (i) => i.id,
  );

  it.each(nonHeadlineIds)("%s has complete, non-empty required fields", (id) => {
    const content = loadIndicatorContent(id);
    expect(content.title.length).toBeGreaterThan(0);
    expect(content.whatItMeasures.length).toBeGreaterThan(0);
    expect(content.whatItPredicts.length).toBeGreaterThan(0);
    expect(content.sourceUrl).toMatch(/^https:\/\//);
    const registryEntry = INDICATOR_REGISTRY.find((i) => i.id === id)!;
    expect(content.isProxy).toBe(registryEntry.isProxy);
    if (content.isProxy) {
      expect(content.proxyExplanation?.length).toBeGreaterThan(0);
    }
  });

  it("headline content has complete fields", () => {
    const headline = loadHeadlineContent();
    expect(headline.asOf.length).toBeGreaterThan(0);
    expect(typeof headline.indexLevel).toBe("number");
    expect(typeof headline.momPercentChange).toBe("number");
    expect(typeof headline.sixMonthAnnualizedGrowth).toBe("number");
  });
});
