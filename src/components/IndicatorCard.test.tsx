// src/components/IndicatorCard.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IndicatorCard } from "./IndicatorCard";
import type { DashboardCardViewModel } from "@/lib/view-model";

const baseCard: DashboardCardViewModel = {
  id: "sp500",
  content: {
    title: "S&P 500 Stock Index",
    whatItMeasures: "x",
    whatItPredicts: "y",
    sourceName: "z",
    sourceUrl: "https://example.org",
    isProxy: false,
  },
  latestValue: { date: "2026-06-14", value: 6100.5 },
  recentObservations: [
    { date: "2026-06-10", value: 6080.2 },
    { date: "2026-06-12", value: 6090.1 },
    { date: "2026-06-14", value: 6100.5 },
  ],
  displayFormat: "points_2dp",
  inverted: false,
  isStale: false,
};

describe("IndicatorCard", () => {
  it("renders the formatted latest value", () => {
    render(<IndicatorCard card={baseCard} />);
    expect(screen.getByText(/6,100\.50/)).toBeInTheDocument();
  });

  it("renders a sparkline chart when recent observations exist", () => {
    const { container } = render(<IndicatorCard card={baseCard} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("shows 'data unavailable' and no sparkline when there is no observation", () => {
    const { container } = render(
      <IndicatorCard card={{ ...baseCard, latestValue: null, recentObservations: [] }} />,
    );
    expect(screen.getByText(/data unavailable/i)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("shows a stale badge when isStale is true", () => {
    render(<IndicatorCard card={{ ...baseCard, isStale: true }} />);
    expect(screen.getByText(/last updated/i)).toBeInTheDocument();
  });

  it("shows a proxy badge whenever content.isProxy is true", () => {
    render(
      <IndicatorCard
        card={{
          ...baseCard,
          content: { ...baseCard.content, isProxy: true, proxyExplanation: "substitute series" },
        }}
      />,
    );
    expect(screen.getByText(/proxy/i)).toBeInTheDocument();
  });

  it("does not show a proxy badge when content.isProxy is false", () => {
    render(<IndicatorCard card={baseCard} />);
    expect(screen.queryByText(/proxy/i)).not.toBeInTheDocument();
  });
});
