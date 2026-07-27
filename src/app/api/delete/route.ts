import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { deleteChunksForResource } from "@/src/library/vectorStore";
import { getMinioClient } from "@/src/library/minioClient";

const s3Client = getMinioClient();

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

    try {
        await s3Client.send(new DeleteObjectCommand({ Bucket: "studora", Key: key }));

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

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (err: any) {
        console.error("Delete error:", err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}