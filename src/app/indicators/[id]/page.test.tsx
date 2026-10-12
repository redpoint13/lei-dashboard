import { describe, it, expect, vi } from "vitest";

const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

describe("IndicatorDetailPage", () => {
  it("calls notFound() for an unknown indicator id, before touching the DB or filesystem", async () => {
    const { default: IndicatorDetailPage } = await import("./page");
    const callsBefore = notFoundMock.mock.calls.length;
    let caught: unknown;
    try {
      await IndicatorDetailPage({ params: Promise.resolve({ id: "totally-bogus-id" }) });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(notFoundMock.mock.calls.length).toBe(callsBefore + 1);
  });

  it("calls notFound() for the headline id, which has no detail page", async () => {
    const { default: IndicatorDetailPage } = await import("./page");
    const callsBefore = notFoundMock.mock.calls.length;
    let caught: unknown;
    try {
      await IndicatorDetailPage({ params: Promise.resolve({ id: "headline" }) });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(notFoundMock.mock.calls.length).toBe(callsBefore + 1);
  });

  it("does not call notFound() for a valid, non-headline indicator id", async () => {
    const { isValidDetailIndicatorId } = await import("@/lib/indicator-registry");
    expect(isValidDetailIndicatorId("sp500")).toBe(true);
  });
});
