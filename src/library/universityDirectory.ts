// Server-only: backs the university search/picker on the Profile page.
// Proxies Hipolabs' free, keyless university-domains-list API rather than
// calling it directly from the client on every keystroke — that hosted
// endpoint isn't SLA'd, and a university's domain/name essentially never
// changes, so a simple in-process cache (mirroring webSearch.ts's small
// server-helper pattern) is enough; no Firestore layer needed here, unlike
// the 3,000-course scrape in courseOfferings/cache.ts.
const HIPOLABS_URL = "http://universities.hipolabs.com/search";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — institution directory data is effectively static
const MAX_RESULTS = 8;

export type UniversityResult = {
  name: string;
  country: string;
  domain: string;
  webPage: string;
};

const cache = new Map<string, { results: UniversityResult[]; expiresAt: number }>();

export async function searchUniversities(query: string): Promise<UniversityResult[]> {
  const key = query.trim().toLowerCase();
  if (!key) return [];

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.results;
  }

  const url = `${HIPOLABS_URL}?name=${encodeURIComponent(key)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error(`University search failed (${response.status})`);
  }

  const raw = (await response.json()) as any[];
  const results: UniversityResult[] = raw
    .filter((u) => Array.isArray(u.domains) && u.domains.length > 0)
    .slice(0, MAX_RESULTS)
    .map((u) => ({
      name: u.name,
      country: u.country ?? "",
      domain: u.domains[0],
      webPage: Array.isArray(u.web_pages) ? u.web_pages[0] ?? "" : "",
    }));

  cache.set(key, { results, expiresAt: Date.now() + CACHE_TTL_MS });
  return results;
}

// Google's keyless favicon service — no signup/API key, sufficient for a
// small badge/icon use case (confirmed with the user as the preferred
// option over logo APIs that now require a free account since Clearbit's
// Logo API was shut down in Dec 2025).
export function getUniversityFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}
