// src/components/IndicatorChart.tsx
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  Brush,
  ResponsiveContainer,
} from "recharts";
import type { IndicatorDetailViewModel } from "@/lib/view-model";
import { ProxyBadge } from "./ProxyBadge";
import { formatValue } from "@/lib/format";

// Recharts' default XAxis is a *category* axis: ReferenceArea's x1/x2 only
// resolve when those exact string values exist among the chart's data
// points. NBER recession boundaries are first-of-month dates (from the
// monthly USREC series), while sp500/rate_spread observations are daily —
// they essentially never land on an exact boundary date, so a category axis
// would silently fail to shade recessions on exactly the two charts with
// real forecasts. Using a numeric/time axis instead makes the axis
// continuous, so the shaded region resolves correctly regardless of whether
// a boundary falls on an observation date.
function toTimestamp(date: string): number {
  return new Date(date).getTime();
}

function formatDateTick(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function IndicatorChart({ viewModel }: { viewModel: IndicatorDetailViewModel }) {
  const { content, observations, recessionPeriods, inverted, displayFormat, forecast, noForecastReason } =
    viewModel;

  const chartData = observations.map((o) => ({
    date: toTimestamp(o.date),
    value: o.value,
  }));

  return (
    <div>
      <h2>{content.title}</h2>
      {content.isProxy && (
        <ProxyBadge
          explanation={content.proxyExplanation ?? ""}
          methodologyUrl={content.proxyMethodologyUrl}
        />
      )}
      {inverted && <p>Note: higher = weaker (this indicator is counter-cyclical)</p>}

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData}>
          <XAxis
            dataKey="date"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={formatDateTick}
          />
          <YAxis
            tickFormatter={(v: number) => formatValue(v, displayFormat)}
          />
          <Tooltip
            formatter={(v: number) => formatValue(v, displayFormat)}
            labelFormatter={formatDateTick}
          />
          {recessionPeriods.map((period) => (
            <ReferenceArea
              key={period.startDate}
              x1={toTimestamp(period.startDate)}
              x2={toTimestamp(period.endDate)}
              fill="currentColor"
              fillOpacity={0.1}
            />
          ))}
          <Line type="monotone" dataKey="value" dot={false} />
          <Brush dataKey="date" height={24} tickFormatter={formatDateTick} />
        </LineChart>
      </ResponsiveContainer>

      {forecast ? (
        <p>
          Forecast: {formatValue(forecast.value, displayFormat)}
          {forecast.valueLow != null && forecast.valueHigh != null && (
            <> (range: {formatValue(forecast.valueLow, displayFormat)}–
              {formatValue(forecast.valueHigh, displayFormat)})</>
          )}{" "}
          by {forecast.horizon} (source: {forecast.sourceLabel})
        </p>
      ) : (
        <p>{noForecastReason}</p>
      )}
    </div>
  );
}
