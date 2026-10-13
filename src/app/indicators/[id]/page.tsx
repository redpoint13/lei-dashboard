import { notFound } from "next/navigation";
import { getAppDb } from "@/lib/app-db";
import { buildIndicatorDetailViewModel } from "@/lib/view-model";
import { IndicatorChart } from "@/components/IndicatorChart";
import { isValidDetailIndicatorId } from "@/lib/indicator-registry";

// Reads live SQLite data (same reasoning as the dashboard page in Task 11):
// must render per-request, and can't be statically generated at build time
// since DATA_DIR's sqlite file doesn't exist yet then.
export const dynamic = "force-dynamic";

export default async function IndicatorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Validate BEFORE any file I/O or DB query: an unknown id (or "headline",
  // which has no detail page) must 404, not 500 from a non-null assertion
  // deep inside buildIndicatorDetailViewModel.
  if (!isValidDetailIndicatorId(id)) {
    notFound();
  }

  const viewModel = buildIndicatorDetailViewModel(getAppDb(), id);
  return (
    <main>
      <IndicatorChart viewModel={viewModel} />
    </main>
  );
}
