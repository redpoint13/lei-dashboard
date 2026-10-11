import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startScheduler } from "./scheduler";

describe("startScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs immediately on cold start (no existing observations)", async () => {
    const runNow = vi.fn().mockResolvedValue(undefined);
    const handle = startScheduler({
      hasAnyObservations: () => false,
      intervalMs: 1000,
      runNow,
    });
    await vi.waitFor(() => expect(runNow).toHaveBeenCalledTimes(1));
    handle.stop();
  });

  it("does not run immediately on a warm start (observations already exist)", () => {
    const runNow = vi.fn().mockResolvedValue(undefined);
    const handle = startScheduler({
      hasAnyObservations: () => true,
      intervalMs: 1000,
      runNow,
    });
    expect(runNow).not.toHaveBeenCalled();
    handle.stop();
  });

  it("runs again after each interval elapses, regardless of cold or warm start", async () => {
    const runNow = vi.fn().mockResolvedValue(undefined);
    const handle = startScheduler({
      hasAnyObservations: () => true,
      intervalMs: 1000,
      runNow,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(runNow).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runNow).toHaveBeenCalledTimes(2);
    handle.stop();
  });

  it("stop() prevents further scheduled runs", async () => {
    const runNow = vi.fn().mockResolvedValue(undefined);
    const handle = startScheduler({
      hasAnyObservations: () => true,
      intervalMs: 1000,
      runNow,
    });
    handle.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(runNow).not.toHaveBeenCalled();
  });

  it("a rejected runNow does not crash and does not stop the recurring interval", async () => {
    const runNow = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient upstream failure"))
      .mockResolvedValue(undefined);
    const handle = startScheduler({
      hasAnyObservations: () => true,
      intervalMs: 1000,
      runNow,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(runNow).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runNow).toHaveBeenCalledTimes(2);
    handle.stop();
  });
});
