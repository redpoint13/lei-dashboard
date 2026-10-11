import { getAppDb } from "@/lib/app-db";
import { buildDashboardViewModel } from "@/lib/view-model";
import { HeadlineCard } from "@/components/HeadlineCard";
import { IndicatorCard } from "@/components/IndicatorCard";

// The dashboard reads live SQLite data that a background refresh job keeps
// updating (Task 7), so it must be rendered per-request rather than baked
// into a static page at build time (which would also fail the build itself,
// since DATA_DIR's sqlite file doesn't exist yet at build time).
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const viewModel = buildDashboardViewModel(getAppDb());
  return (
    <main>
      <HeadlineCard content={viewModel.headline} />
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem" }}>
        {viewModel.cards.map((card) => (
          <IndicatorCard key={card.id} card={card} />
        ))}
      </section>
    </main>
  );
}
