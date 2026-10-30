import { NextRequest, NextResponse } from "next/server";
import { isInternalRequest } from "@/src/library/verifyAuth";
import type { DailyRollup } from "@/src/library/billing/dailyRollup";
import { buildAndStoreDay, dayKey, dayKeysBack, readDays, writeSnapshot } from "@/src/library/billing/rollupStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How many day documents the GCS snapshot carries: the dashboard's longest window. */
const SNAPSHOT_DAYS = 31;

/** The requested UTC day, yesterday when none is given, or null when it is not a complete UTC day. */
function requestedDay(request: NextRequest): string | null {
  const day = request.nextUrl.searchParams.get("day");
  if (day === null) return dayKeysBack(1)[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const start = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || dayKey(start) !== day) return null;
  // ISO day keys compare in date order; today is still filling up, so only earlier days can be built.
  return day < dayKey(new Date()) ? day : null;
}

async function refreshSnapshot(): Promise<boolean> {
  try {
    const { rollups } = await readDays(dayKeysBack(SNAPSHOT_DAYS));
    return await writeSnapshot(rollups);
  } catch (error) {
    console.error("[internal/ai-rollup] snapshot refresh failed:", error);
    return false;
  }
}

// Called nightly by .github/workflows/ai-rollup.yml, using the server-only internal secret.
export async function POST(request: NextRequest) {
  if (!process.env.INTERNAL_API_SECRET) {
    console.error("[internal/ai-rollup] INTERNAL_API_SECRET is not configured");
    return NextResponse.json({ error: "Rollup worker is not configured." }, { status: 503 });
  }
  if (!isInternalRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const day = requestedDay(request);
  if (!day) return NextResponse.json({ error: "day must be a complete UTC day, YYYY-MM-DD, before today." }, { status: 400 });

  let built: DailyRollup;
  try {
    built = await buildAndStoreDay(day);
  } catch (error) {
    console.error(`[internal/ai-rollup] build of ${day} failed:`, error);
    return NextResponse.json({ error: "Rollup build failed." }, { status: 500 });
  }

  // A missing snapshot only costs the quota fallback, so the night's build still counts as done.
  const snapshotWritten = await refreshSnapshot();
  return NextResponse.json({ day, rowsRead: built.rowsRead, truncated: built.truncated, snapshotWritten });
}
