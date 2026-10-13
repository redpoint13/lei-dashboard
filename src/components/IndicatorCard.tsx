// src/components/IndicatorCard.tsx
"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";
import type { DashboardCardViewModel } from "@/lib/view-model";
import { formatValue } from "@/lib/format";

export function IndicatorCard({ card }: { card: DashboardCardViewModel }) {
  return (
    <article aria-label={card.content.title} style={{ border: "1px solid", padding: "0.75rem" }}>
      <h3>{card.content.title}</h3>
      {card.content.isProxy && <span>Proxy series</span>}
      {card.latestValue ? (
        <>
          <p>{formatValue(card.latestValue.value, card.displayFormat)}</p>
          {card.recentObservations.length > 0 && (
            <ResponsiveContainer width="100%" height={48}>
              <LineChart data={card.recentObservations}>
                <Line type="monotone" dataKey="value" dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          )}
          {card.isStale && <span>Last updated {card.latestValue.date} (stale)</span>}
        </>
      ) : (
        <p>Data unavailable</p>
      )}
      {card.inverted && <small>Higher = weaker</small>}
      <a href={`/indicators/${card.id}`}>View details</a>
    </article>
  );
}
