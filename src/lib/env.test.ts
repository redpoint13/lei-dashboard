// src/lib/env.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDataDir } from "./env";

describe("getDataDir", () => {
  const original = process.env.DATA_DIR;
  afterEach(() => {
    if (original === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = original;
  });

  it("defaults to ./.data when DATA_DIR is unset", () => {
    delete process.env.DATA_DIR;
    expect(getDataDir()).toBe("./.data");
  });

  it("uses DATA_DIR when set", () => {
    process.env.DATA_DIR = "/data";
    expect(getDataDir()).toBe("/data");
  });
});
