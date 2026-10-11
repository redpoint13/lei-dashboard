import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadIndicatorContent, loadManualObservations } from "./content";

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
});

describe("loadManualObservations", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "econ-manual-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
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
