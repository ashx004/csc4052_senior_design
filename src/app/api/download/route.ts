// src/app/api/download/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, isInternalRequest } from "@/src/library/verifyAuth";
import { getObject } from "@/src/library/gcsStorage";
import { isAccountDeletionInProgress } from "@/src/library/accountDeletionGuard";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const key = req.nextUrl.searchParams.get("key");
    if (!key) {
        return NextResponse.json({ error: "Missing key" }, { status: 400 });
    }

    // Server-to-server calls (read_document, generate-flashcards) carry the
    // internal secret and skip the browser-session check entirely. Every
    // other caller must be logged in as the owner of this specific key.
    if (!isInternalRequest(req)) {
        const auth = await verifyRequestAuth(req);
        if (!auth) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (!key.startsWith(`users/${auth.uid}/`)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (await isAccountDeletionInProgress(auth.uid)) {
            return NextResponse.json({ error: "This account is being deleted." }, { status: 410 });
        }
    }

    try {
        const result = await getObject(key);
        return new NextResponse(new Uint8Array(result.body), {
            headers: {
                "Content-Type": result.contentType || "application/octet-stream",
                "Cache-Control": "private, no-store",
            },
        });
    } catch (err: any) {
        console.error("Download error:", err.message);
        return NextResponse.json({ error: err.message }, { status: 404 });
    }
}
