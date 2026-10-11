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

export function IndicatorChart({ viewModel }: { viewModel: IndicatorDetailViewModel }) {
  const { content, observations, recessionPeriods, inverted, displayFormat, forecast, noForecastReason } =
    viewModel;

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
        <LineChart data={observations}>
          <XAxis dataKey="date" />
          <YAxis
            tickFormatter={(v: number) => formatValue(v, displayFormat)}
          />
          <Tooltip formatter={(v: number) => formatValue(v, displayFormat)} />
          {recessionPeriods.map((period) => (
            <ReferenceArea
              key={period.startDate}
              x1={period.startDate}
              x2={period.endDate}
              fill="currentColor"
              fillOpacity={0.1}
            />
          ))}
          <Line type="monotone" dataKey="value" dot={false} />
          <Brush dataKey="date" height={24} />
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
