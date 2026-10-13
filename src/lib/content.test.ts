import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadIndicatorContent, loadManualObservations, loadHeadlineContent } from "./content";

describe("loadIndicatorContent", () => {
  let overrideDir: string;

  beforeEach(() => {
    overrideDir = mkdtempSync(path.join(tmpdir(), "econ-content-"));
  });

  afterEach(() => {
    rmSync(overrideDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("loads the repo default when no override directory is set", () => {
    vi.stubEnv("DATA_DIR", path.join(overrideDir, "does-not-exist"));
    const content = loadIndicatorContent("sp500");
    expect(content.title).toContain("S&P 500");
  });

  it("prefers the override file when present on the mounted volume path", () => {
    vi.stubEnv("DATA_DIR", overrideDir);
    mkdirSync(path.join(overrideDir, "curated"), { recursive: true });
    writeFileSync(
      path.join(overrideDir, "curated", "sp500.json"),
      JSON.stringify({
        title: "Overridden Title",
        whatItMeasures: "x",
        whatItPredicts: "y",
        sourceName: "z",
        sourceUrl: "https://example.org",
        isProxy: false,
      }),
    );
    expect(loadIndicatorContent("sp500").title).toBe("Overridden Title");
  });

  it("falls back to the repo default and logs when the override file is malformed", () => {
    vi.stubEnv("DATA_DIR", overrideDir);
    mkdirSync(path.join(overrideDir, "curated"), { recursive: true });
    writeFileSync(path.join(overrideDir, "curated", "sp500.json"), "{not valid json");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const content = loadIndicatorContent("sp500");
    expect(content.title).toContain("S&P 500");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("falls back to the repo default and logs when the override file is valid JSON but the wrong shape", () => {
    vi.stubEnv("DATA_DIR", overrideDir);
    mkdirSync(path.join(overrideDir, "curated"), { recursive: true });
    // Valid JSON, but isProxy is a string instead of a boolean — must not
    // crash downstream code that trusts the documented shape.
    writeFileSync(
      path.join(overrideDir, "curated", "sp500.json"),
      JSON.stringify({
        title: "Overridden Title",
        whatItMeasures: "x",
        whatItPredicts: "y",
        sourceName: "z",
        sourceUrl: "https://example.org",
        isProxy: "false",
      }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const content = loadIndicatorContent("sp500");
    expect(content.title).toContain("S&P 500"); // repo default, not the override
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("loadHeadlineContent", () => {
  let overrideDir: string;

  beforeEach(() => {
    overrideDir = mkdtempSync(path.join(tmpdir(), "econ-headline-"));
  });

  afterEach(() => {
    rmSync(overrideDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("falls back to the repo default when the override's indexLevel is a string instead of a number", () => {
    vi.stubEnv("DATA_DIR", overrideDir);
    mkdirSync(path.join(overrideDir, "curated"), { recursive: true });
    writeFileSync(
      path.join(overrideDir, "curated", "headline.json"),
      JSON.stringify({
        indexLevel: "ninety-seven point six", // wrong type — HeadlineCard calls .toFixed() on this
        momPercentChange: -0.2,
        sixMonthAnnualizedGrowth: -2.4,
        asOf: "2026-01-01",
      }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const headline = loadHeadlineContent();
    expect(typeof headline.indexLevel).toBe("number"); // repo default, not the malformed override
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("uses the override when it matches the expected shape", () => {
    vi.stubEnv("DATA_DIR", overrideDir);
    mkdirSync(path.join(overrideDir, "curated"), { recursive: true });
    writeFileSync(
      path.join(overrideDir, "curated", "headline.json"),
      JSON.stringify({
        indexLevel: 100.1,
        momPercentChange: 0.3,
        sixMonthAnnualizedGrowth: 1.1,
        asOf: "2026-03-01",
      }),
    );
    const headline = loadHeadlineContent();
    expect(headline.indexLevel).toBe(100.1);
    expect(headline.asOf).toBe("2026-03-01");
  });
});

describe("loadManualObservations", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "econ-manual-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("falls back to the repo default observations when the override file is malformed", () => {
    const repoRoot = mkdtempSync(path.join(tmpdir(), "econ-repo-"));
    try {
      mkdirSync(path.join(repoRoot, "content", "manual-observations"), { recursive: true });
      writeFileSync(
        path.join(repoRoot, "content", "manual-observations", "test_indicator.json"),
        JSON.stringify({ observations: [{ date: "2026-01-01", value: 48.5 }] }),
      );
      vi.spyOn(process, "cwd").mockReturnValue(repoRoot);

      vi.stubEnv("DATA_DIR", dataDir);
      mkdirSync(path.join(dataDir, "curated", "manual-observations"), { recursive: true });
      writeFileSync(
        path.join(dataDir, "curated", "manual-observations", "test_indicator.json"),
        "{not valid json",
      );
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(loadManualObservations("test_indicator")).toEqual([
        { date: "2026-01-01", value: 48.5 },
      ]);
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("returns [] when no manual-observations file exists for an indicator", () => {
    vi.stubEnv("DATA_DIR", dataDir);
    expect(loadManualObservations("does_not_exist_yet")).toEqual([]);
  });

  it("loads the real curated observations for ism_new_orders", () => {
    vi.stubEnv("DATA_DIR", dataDir);
    const observations = loadManualObservations("ism_new_orders");
    expect(observations.length).toBeGreaterThan(0);
    expect(observations[0]).toHaveProperty("date");
    expect(observations[0]).toHaveProperty("value");
  });
});
