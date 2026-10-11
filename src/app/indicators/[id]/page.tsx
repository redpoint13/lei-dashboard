import { getAppDb } from "@/lib/app-db";
import { buildIndicatorDetailViewModel } from "@/lib/view-model";
import { IndicatorChart } from "@/components/IndicatorChart";

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
  const viewModel = buildIndicatorDetailViewModel(getAppDb(), id);
  return (
    <main>
      <IndicatorChart viewModel={viewModel} />
    </main>
  );
}
