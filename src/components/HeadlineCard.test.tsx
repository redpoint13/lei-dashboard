// src/components/HeadlineCard.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeadlineCard } from "./HeadlineCard";

describe("HeadlineCard", () => {
  it("shows the index level, 1-month change, and 6-month annualized growth", () => {
    render(
      <HeadlineCard
        content={{
          indexLevel: 97.6,
          momPercentChange: -0.2,
          sixMonthAnnualizedGrowth: -2.4,
          asOf: "2025-12-31",
          recessionSignalCommentary: "Fell for a fifth consecutive month.",
        }}
      />,
    );
    expect(screen.getByText(/97\.6/)).toBeInTheDocument();
    expect(screen.getByText(/-0\.2%/)).toBeInTheDocument();
    expect(screen.getByText(/-2\.4%/)).toBeInTheDocument();
    expect(screen.getByText(/Fell for a fifth consecutive month/)).toBeInTheDocument();
  });
});
