import { describe, it, expect } from "vitest";
import { formatValue } from "./format";

describe("formatValue", () => {
  it("formats integer", () => expect(formatValue(220000, "integer")).toBe("220,000"));
  it("formats decimal_0dp", () => expect(formatValue(1319.4, "decimal_0dp")).toBe("1,319"));
  it("formats decimal_1dp", () => expect(formatValue(34.567, "decimal_1dp")).toBe("34.6"));
  it("formats decimal_2dp", () => expect(formatValue(0.6, "decimal_2dp")).toBe("0.60"));
  it("formats percent_1dp", () => expect(formatValue(-0.2, "percent_1dp")).toBe("-0.2%"));
  it("formats usd_millions", () => expect(formatValue(245517, "usd_millions")).toBe("$245,517M"));
  it("formats points_2dp", () => expect(formatValue(6100.456, "points_2dp")).toBe("6,100.46"));
});
