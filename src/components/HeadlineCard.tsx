// src/components/HeadlineCard.tsx
import type { HeadlineContent } from "@/lib/content";

export function HeadlineCard({ content }: { content: HeadlineContent }) {
  return (
    <section aria-label="LEI Headline" style={{ border: "2px solid", padding: "1rem" }}>
      <h2>The Conference Board Leading Economic Index</h2>
      <p>Level: {content.indexLevel.toFixed(1)} (as of {content.asOf})</p>
      <p>1-month change: {content.momPercentChange.toFixed(1)}%</p>
      <p>6-month annualized growth: {content.sixMonthAnnualizedGrowth.toFixed(1)}%</p>
      {content.recessionSignalCommentary && <p>{content.recessionSignalCommentary}</p>}
    </section>
  );
}
