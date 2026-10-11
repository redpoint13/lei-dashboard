// src/lib/indicator-registry.test.ts
import { describe, it, expect } from "vitest";
import { INDICATOR_REGISTRY } from "./indicator-registry";

describe("INDICATOR_REGISTRY", () => {
  it("has exactly 11 entries (10 LEI components + headline)", () => {
    expect(INDICATOR_REGISTRY).toHaveLength(11);
  });

  it("flags initial claims and the credit-index proxy as inverted", () => {
    const claims = INDICATOR_REGISTRY.find((i) => i.id === "initial_claims");
    const credit = INDICATOR_REGISTRY.find((i) => i.id === "leading_credit_index");
    expect(claims?.inverted).toBe(true);
    expect(credit?.inverted).toBe(true);
  });

  it("marks the headline as having no FRED series and no LEI component number", () => {
    const headline = INDICATOR_REGISTRY.find((i) => i.id === "headline");
    expect(headline?.fredSeries).toBeNull();
    expect(headline?.leiComponent).toBeNull();
  });

  it("marks exactly the 4 known proxies as proxies", () => {
    const proxies = INDICATOR_REGISTRY.filter((i) => i.isProxy).map((i) => i.id).sort();
    expect(proxies).toEqual(
      [
        "consumer_goods_orders",
        "ism_new_orders",
        "leading_credit_index",
        "consumer_expectations",
      ].sort(),
    );
  });
});
