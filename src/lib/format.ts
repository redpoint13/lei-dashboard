export function formatValue(value: number, displayFormat: string): string {
  switch (displayFormat) {
    case "integer":
      return Math.round(value).toLocaleString("en-US");
    case "decimal_0dp":
      return value.toLocaleString("en-US", { maximumFractionDigits: 0, minimumFractionDigits: 0 });
    case "decimal_1dp":
      return value.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
    case "decimal_2dp":
      return value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
    case "percent_1dp":
      return `${value.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
    case "usd_millions":
      return `$${Math.round(value).toLocaleString("en-US")}M`;
    case "points_2dp":
      return value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
    default:
      return String(value);
  }
}
