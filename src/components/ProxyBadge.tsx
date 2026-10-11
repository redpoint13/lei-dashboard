// src/components/ProxyBadge.tsx
export function ProxyBadge({
  explanation,
  methodologyUrl,
}: {
  explanation: string;
  methodologyUrl?: string;
}) {
  return (
    <aside role="note" aria-label="Proxy series notice">
      <strong>Proxy series:</strong> {explanation}
      {methodologyUrl && (
        <a href={methodologyUrl}>Read the methodology note</a>
      )}
    </aside>
  );
}
