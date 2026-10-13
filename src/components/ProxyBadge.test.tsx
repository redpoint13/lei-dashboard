import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProxyBadge } from "./ProxyBadge";

describe("ProxyBadge", () => {
  it("renders the explanation and links to the methodology note", () => {
    render(
      <ProxyBadge
        explanation="Substitute series, not the official component."
        methodologyUrl="https://example.org/methodology"
      />,
    );
    expect(screen.getByText(/substitute series/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /methodology/i })).toHaveAttribute(
      "href",
      "https://example.org/methodology",
    );
  });

  it("separates the explanation text from the methodology link with a space", () => {
    render(
      <ProxyBadge
        explanation="Substitute series, not the official component."
        methodologyUrl="https://example.org/methodology"
      />,
    );
    expect(screen.getByRole("note").textContent).toContain(
      "component. Read the methodology note",
    );
  });
});
