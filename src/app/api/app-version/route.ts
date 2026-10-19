import { NextResponse } from "next/server";
import { compareVersions, type AndroidRelease, type AppVersionInfo } from "@/src/library/appVersion";

// What's currently live, so open tabs and the Android app can tell when
// they're out of date:
//   build    - the deployed commit (NEXT_PUBLIC_BUILD_ID, set by CI)
//   android  - the newest Android app on GitHub Releases (tags "app-vX.Y.Z")
// GitHub allows 60 anonymous API calls an hour per IP, so the release lookup
// is cached here rather than made by each visitor.
const REPO = process.env.APP_RELEASES_REPO || "ashx004/csc4052_senior_design";
const CACHE_MS = 10 * 60 * 1000;
export const dynamic = "force-dynamic";

let cached: { at: number; android: AndroidRelease } | null = null;

async function latestAndroidRelease(): Promise<AndroidRelease> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.android;
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const releases = (await response.json()) as {
      tag_name: string;
      draft: boolean;
      prerelease: boolean;
      html_url: string;
      assets: { name: string; browser_download_url: string }[];
    }[];
    let android: AndroidRelease = null;
    for (const release of releases) {
      const match = /^app-v(\d+\.\d+\.\d+)$/.exec(release.tag_name);
      const apk = release.assets.find((asset) => asset.name.endsWith(".apk"));
      if (!match || !apk || release.draft || release.prerelease) continue;
      if (!android || compareVersions(match[1], android.version) > 0) {
        android = { version: match[1], url: apk.browser_download_url, notesUrl: release.html_url };
      }
    }
    cached = { at: Date.now(), android };
    return android;
  } catch (error) {
    console.warn("App release lookup failed:", error);
    // Keep serving the last known answer; retry in a minute rather than ten.
    cached = { at: Date.now() - CACHE_MS + 60_000, android: cached?.android ?? null };
    return cached.android;
  }
}

export async function GET() {
  return NextResponse.json<AppVersionInfo>(
    { build: process.env.NEXT_PUBLIC_BUILD_ID || null, android: await latestAndroidRelease() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
