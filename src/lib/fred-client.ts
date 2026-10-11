export class FredApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "FredApiError";
    this.status = status;
  }
}

export async function fetchFredSeries(
  seriesId: string,
  observationStart: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ date: string; value: number | null }[]> {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("observation_start", observationStart);

  let response: Response;
  try {
    response = await fetchImpl(url.toString());
  } catch (err) {
    throw new FredApiError(
      `Network error fetching FRED series ${seriesId}: ${(err as Error).message}`,
    );
  }

  if (!response.ok) {
    throw new FredApiError(
      `FRED API returned ${response.status} for series ${seriesId}`,
      response.status,
    );
  }

  const body = (await response.json()) as {
    observations: { date: string; value: string }[];
  };

  return body.observations.map((obs) => ({
    date: obs.date,
    value: obs.value === "." ? null : Number(obs.value),
  }));
}
