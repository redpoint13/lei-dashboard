import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IndicatorChart } from "./IndicatorChart";
import type { IndicatorDetailViewModel } from "@/lib/view-model";

const base: IndicatorDetailViewModel = {
  id: "avg_weekly_hours_mfg",
  content: {
    title: "Average Weekly Hours, Manufacturing",
    whatItMeasures: "Average weekly hours worked by production employees.",
    whatItPredicts: "Overtime and hours cuts tend to lead hiring/layoff decisions.",
    sourceName: "Bureau of Labor Statistics (via FRED, series AWHMAN)",
    sourceUrl: "https://example.org",
    isProxy: false,
  },
  observations: [
    { date: "2025-01-01", value: 40.1 },
    { date: "2025-02-01", value: 40.3 },
  ],
  recessionPeriods: [{ startDate: "2020-02-01", endDate: "2020-04-01" }],
  inverted: false,
  displayFormat: "decimal_1dp",
  forecast: null,
  noForecastReason: "No analyst consensus forecast available for this series.",
};

describe("IndicatorChart", () => {
  it("shows the no-forecast message when forecast is null", () => {
    render(<IndicatorChart viewModel={base} />);
    expect(screen.getByText(/no analyst consensus forecast/i)).toBeInTheDocument();
  });

  it("shows the forecast value and source when present", () => {
    render(
      <IndicatorChart
        viewModel={{
          ...base,
          forecast: {
            asOf: "2025-12-19",
            horizon: "2026-12-31",
            value: 0.6,
            sourceUrl: "https://example.org/forecast",
            sourceLabel: "Test Source",
          },
          noForecastReason: null,
        }}
      />,
    );
    expect(screen.getByText(/Test Source/)).toBeInTheDocument();
  });

  it("shows the forecast's low/high range when present, rather than discarding it", () => {
    render(
      <IndicatorChart
        viewModel={{
          ...base,
          displayFormat: "integer",
          forecast: {
            asOf: "2026-01-06",
            horizon: "2026-12-31",
            value: 7600,
            valueLow: 7100,
            valueHigh: 8100,
            sourceUrl: "https://example.org/forecast",
            sourceLabel: "Reuters poll",
          },
          noForecastReason: null,
        }}
      />,
    );
    expect(screen.getByText(/7,100/)).toBeInTheDocument();
    expect(screen.getByText(/8,100/)).toBeInTheDocument();
  });

  it("shows the inverted annotation when inverted is true", () => {
    render(<IndicatorChart viewModel={{ ...base, inverted: true }} />);
    expect(screen.getByText(/higher = weaker/i)).toBeInTheDocument();
  });

  it("does not show the inverted annotation when inverted is false", () => {
    render(<IndicatorChart viewModel={base} />);
    expect(screen.queryByText(/higher = weaker/i)).not.toBeInTheDocument();
  });

  it("shows the proxy badge whenever content.isProxy is true", () => {
    render(
      <IndicatorChart
        viewModel={{
          ...base,
          content: { ...base.content, isProxy: true, proxyExplanation: "substitute" },
        }}
      />,
    );
    expect(screen.getByText(/proxy series/i)).toBeInTheDocument();
  });

  it("does not show the proxy badge when content.isProxy is false", () => {
    render(<IndicatorChart viewModel={base} />);
    expect(screen.queryByText(/proxy series/i)).not.toBeInTheDocument();
  });

  it("renders the plain-language description/source panel (what it measures, what it predicts, source link)", () => {
    render(<IndicatorChart viewModel={base} />);
    expect(screen.getByText(base.content.whatItMeasures)).toBeInTheDocument();
    expect(screen.getByText(base.content.whatItPredicts)).toBeInTheDocument();
    const sourceLink = screen.getByRole("link", { name: base.content.sourceName });
    expect(sourceLink).toHaveAttribute("href", base.content.sourceUrl);
  });

  it("renders the forecast's asOf date and a link to its sourceUrl when a forecast is present", () => {
    render(
      <IndicatorChart
        viewModel={{
          ...base,
          forecast: {
            asOf: "2025-12-10 (Fed) / 2025-12-19 (Livingston)",
            horizon: "2026-12-31",
            value: 0.6,
            sourceUrl: "https://example.org/forecast-source",
            sourceLabel: "Test Source",
          },
          noForecastReason: null,
        }}
      />,
    );
    // Composite asOf strings (like the real rate_spread one) are rendered
    // as-is, never parsed as a date.
    expect(
      screen.getByText(/As of 2025-12-10 \(Fed\) \/ 2025-12-19 \(Livingston\)/),
    ).toBeInTheDocument();
    const forecastLink = screen.getByRole("link", { name: "Test Source" });
    expect(forecastLink).toHaveAttribute("href", "https://example.org/forecast-source");
  });

  it("does not render a forecast asOf line when there is no forecast", () => {
    render(<IndicatorChart viewModel={base} />);
    expect(screen.queryByText(/^As of /)).not.toBeInTheDocument();
  });

  it("renders recession shading even when period boundaries don't land on an observation date (daily series vs. monthly NBER boundaries)", () => {
    const { container } = render(
      <IndicatorChart
        viewModel={{
          ...base,
          // Daily/sparse observation dates, like the real sp500/rate_spread
          // series — none of these match the recession boundary dates below.
          observations: [
            { date: "2025-01-05", value: 40.1 },
            { date: "2025-01-20", value: 40.3 },
            { date: "2025-02-15", value: 40.5 },
          ],
          // First-of-month-style NBER boundaries that fall strictly inside
          // the observation date range above, but never exactly match one.
          recessionPeriods: [{ startDate: "2025-01-10", endDate: "2025-01-25" }],
        }}
      />,
    );
    expect(container.querySelector(".recharts-reference-area")).not.toBeNull();
  });
});
