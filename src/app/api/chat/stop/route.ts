// Stop button: cancel the reply that run `runId` is still writing.
//   POST { runId } -> { stopped: boolean }
// `stopped` is false when the reply had already finished, which is fine.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { stopChatRun } from "@/src/library/chatRuns";
import { RUN_ID_PATTERN } from "@/src/library/chatRequest";

const bodySchema = z.object({ runId: z.string().regex(RUN_ID_PATTERN) });

export async function POST(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  return NextResponse.json({ stopped: stopChatRun(auth.uid, parsed.data.runId) });
}
