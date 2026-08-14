// Server-only: general web research for the AI assistant. Tries Tavily
// first (a search API built for LLM/agent consumption — results come
// pre-cleaned rather than raw HTML), and falls back to Brave Search if
// Tavily fails or its free-tier credits run out and Brave is configured.
export type WebSearchResult = {
  title: string;
  url: string;
  content: string;
};

const DEFAULT_MAX_RESULTS = 5;

// Reputable open-access academic sources — used when a query calls for
// scholarly grounding instead of general web results. Deliberately excludes
// mostly-paywalled sites (JSTOR, ScienceDirect) and Google Scholar (no
// sanctioned API; scraping it violates its ToS and is fragile besides).
const SCHOLARLY_DOMAINS = [
  "arxiv.org",
  "ncbi.nlm.nih.gov",
  "semanticscholar.org",
  "core.ac.uk",
  "doaj.org",
  "eric.ed.gov",
  "plos.org",
];

async function searchTavily(
  query: string,
  maxResults: number,
  scholarly: boolean
): Promise<WebSearchResult[]> {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error("Tavily is not configured.");
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
      ...(scholarly ? { include_domains: SCHOLARLY_DOMAINS } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Tavily request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const results = Array.isArray(data?.results) ? data.results : [];

  return results.map((r: any) => ({
    title: r.title ?? "Untitled",
    url: r.url ?? "",
    content: r.content ?? "",
  }));
}

async function searchBrave(
  query: string,
  maxResults: number,
  scholarly: boolean
): Promise<WebSearchResult[]> {
  if (!process.env.BRAVE_SEARCH_API_KEY) {
    throw new Error("Brave Search is not configured.");
  }

  const effectiveQuery = scholarly
    ? `${query} (${SCHOLARLY_DOMAINS.map((d) => `site:${d}`).join(" OR ")})`
    : query;

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", effectiveQuery);
  url.searchParams.set("count", String(Math.min(maxResults, 20)));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Brave Search request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const results = Array.isArray(data?.web?.results) ? data.web.results : [];

  return results.map((r: any) => ({
    title: r.title ?? "Untitled",
    url: r.url ?? "",
    content: r.description ?? "",
  }));
}

export async function searchWeb(
  query: string,
  maxResults: number = DEFAULT_MAX_RESULTS,
  scholarly: boolean = false
): Promise<WebSearchResult[]> {
  const cappedResults = Math.max(1, Math.min(maxResults, 8)); // keep it sane regardless of what's asked for

  try {
    return await searchTavily(query, cappedResults, scholarly);
  } catch (tavilyError) {
    if (!process.env.BRAVE_SEARCH_API_KEY) {
      throw tavilyError;
    }
    console.error("Tavily search failed, falling back to Brave:", tavilyError);
    return searchBrave(query, cappedResults, scholarly);
  }
}
