import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { searchUniversities } from "@/src/library/universityDirectory";
import { checkRateLimit } from "@/src/library/rateLimit";

const MIN_QUERY_LENGTH = 2;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60; // autocomplete, same generous-but-bounded budget as courses/search

export async function GET(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = checkRateLimit(auth.uid, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests — please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchUniversities(q);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("University search failed:", error);
    return NextResponse.json({ results: [] });
  }
}
