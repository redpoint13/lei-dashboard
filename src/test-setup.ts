import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver and reports 0x0 element bounds, which breaks
// Recharts' ResponsiveContainer (used for sparkline charts). Polyfill with a
// no-op observer and give elements a non-zero measured size so charts render.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  value: 400,
});
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  value: 200,
});
HTMLElement.prototype.getBoundingClientRect = () => ({
  width: 400,
  height: 200,
  top: 0,
  left: 0,
  right: 400,
  bottom: 200,
  x: 0,
  y: 0,
  toJSON() {
    return this;
  },
});
