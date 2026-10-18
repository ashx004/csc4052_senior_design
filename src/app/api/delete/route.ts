import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { deleteChunksForResource } from "@/src/library/vectorStore";
import { deleteObject } from "@/src/library/gcsStorage";
import { forgetDocumentText } from "@/src/library/documentTextCache";
import { isAccountDeletionInProgress } from "@/src/library/accountDeletionGuard";

export async function DELETE(req: NextRequest) {
    const key = req.nextUrl.searchParams.get("key");
    if (!key) {
        return NextResponse.json({ error: "Missing key" }, { status: 400 });
    }

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

    try {
        await deleteObject(key);

        // Optional: clean up this resource's Qdrant vectors too (hygiene —
        // orphaned points are otherwise harmless, never matched since
        // search always filters to resourceIds pulled from live Firestore
        // data, but cheap to remove properly). Client can't do this itself:
        // vectorStore.ts needs server-only QDRANT_API_KEY.
        const resourceId = req.nextUrl.searchParams.get("resourceId");
        if (resourceId) {
            await deleteChunksForResource(auth.uid, resourceId).catch((err) =>
                console.error("Qdrant chunk cleanup failed (non-fatal):", err)
            );
        }

        // Its cached text goes too (documentTextCache.ts).
        await forgetDocumentText(req, key).catch(() => {});

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (err: any) {
        console.error("Delete error:", err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
