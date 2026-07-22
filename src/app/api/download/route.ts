// src/app/api/download/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { verifyRequestAuth, isInternalRequest } from "@/src/library/verifyAuth";

const s3Client = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT, // e.g. "http://192.168.1.11:9069"
    region: "us-east-1",
    credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY!,
        secretAccessKey: process.env.MINIO_SECRET_KEY!,
    },
    forcePathStyle: true,
    tls: true,
});

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
    }

    try {
        const result = await s3Client.send(
            new GetObjectCommand({ Bucket: "studora", Key: key })
        );
        const body = await result.Body!.transformToByteArray();
        return new NextResponse(Buffer.from(body), {
            headers: { "Content-Type": result.ContentType || "application/octet-stream" },
        });
    } catch (err: any) {
        console.error("Download error:", err.message);
        return NextResponse.json({ error: err.message }, { status: 404 });
    }
}
