// Server-only: lets the assistant find and reference real explainer/lecture
// videos via the official YouTube Data API (search.list) — not scraping.
// Free tier: search.list has its own dedicated daily bucket (~100 calls/day
// as of the June 2026 quota split), plenty for a class-project scale app.
export type YoutubeResult = {
  title: string;
  channelTitle: string;
  url: string;
  description: string;
  thumbnailUrl: string;
};

const DEFAULT_MAX_RESULTS = 3;

export async function searchYoutube(
  query: string,
  maxResults: number = DEFAULT_MAX_RESULTS
): Promise<YoutubeResult[]> {
  if (!process.env.YOUTUBE_API_KEY) {
    throw new Error("YouTube search is not configured.");
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", String(Math.max(1, Math.min(maxResults, 5))));
  url.searchParams.set("q", query);
  url.searchParams.set("key", process.env.YOUTUBE_API_KEY);
  // Bias toward substantive explainers over shorts/clips for a study assistant.
  url.searchParams.set("videoDuration", "medium");
  url.searchParams.set("safeSearch", "strict");

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`YouTube search failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const items = Array.isArray(data?.items) ? data.items : [];

  return items
    .filter((item: any) => item?.id?.videoId)
    .map((item: any) => ({
      title: item.snippet?.title ?? "Untitled",
      channelTitle: item.snippet?.channelTitle ?? "Unknown channel",
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      description: item.snippet?.description ?? "",
      thumbnailUrl:
        item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? "",
    }));
}
