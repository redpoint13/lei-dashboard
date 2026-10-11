import { describe, it, expect, vi } from "vitest";
import { fetchFredSeries, FredApiError } from "./fred-client";

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe("fetchFredSeries", () => {
  it("parses a successful response into date/value pairs", async () => {
    const fetchImpl = mockFetch({
      observations: [
        { date: "2026-01-01", value: "6090.1" },
        { date: "2026-01-02", value: "6100.5" },
      ],
    });
    const result = await fetchFredSeries("SP500", "2025-07-01", "fake-key", fetchImpl);
    expect(result).toEqual([
      { date: "2026-01-01", value: 6090.1 },
      { date: "2026-01-02", value: 6100.5 },
    ]);
  });

  it("maps FRED's '.' missing-value marker to null instead of crashing or using 0", async () => {
    const fetchImpl = mockFetch({
      observations: [
        { date: "2026-01-01", value: "6090.1" },
        { date: "2026-01-02", value: "." },
      ],
    });
    const result = await fetchFredSeries("SP500", "2025-07-01", "fake-key", fetchImpl);
    expect(result).toEqual([
      { date: "2026-01-01", value: 6090.1 },
      { date: "2026-01-02", value: null },
    ]);
  });

  it("throws FredApiError with the HTTP status on a non-200 response", async () => {
    const fetchImpl = mockFetch({ error_message: "Bad API key" }, false, 400);
    await expect(
      fetchFredSeries("SP500", "2025-07-01", "bad-key", fetchImpl),
    ).rejects.toMatchObject({ name: "FredApiError", status: 400 });
  });

  it("wraps a network failure in FredApiError", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    await expect(
      fetchFredSeries("SP500", "2025-07-01", "fake-key", fetchImpl),
    ).rejects.toBeInstanceOf(FredApiError);
  });
});
