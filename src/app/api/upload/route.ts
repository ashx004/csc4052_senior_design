// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { putObject } from "@/src/library/gcsStorage";
import { isAccountDeletionInProgress } from "@/src/library/accountDeletionGuard";
import { checkRateLimit } from "@/src/library/rateLimit";

// The browser already enforces 20MB (MAX_FILE_SIZE_BYTES in fileUploadService),
// but nothing stopped a direct request from sending more. The small margin
// covers requests whose body is slightly larger than the file itself.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const UPLOAD_RATE_LIMIT_WINDOW_MS = 60_000;
const UPLOAD_RATE_LIMIT_MAX = 60;

export async function POST(req: NextRequest) {
    try {
        const storagePath = req.headers.get('x-storage-path');
        const contentType = req.headers.get('content-type') || 'application/octet-stream';

        if (!storagePath) {
            return NextResponse.json({ error: 'Missing x-storage-path header' }, { status: 400 });
        }

        const auth = await verifyRequestAuth(req);
        if (!auth) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!storagePath.startsWith(`users/${auth.uid}/`)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        if (await isAccountDeletionInProgress(auth.uid)) {
            return NextResponse.json({ error: "This account is being deleted." }, { status: 410 });
        }

        const rateLimit = checkRateLimit(`upload:${auth.uid}`, UPLOAD_RATE_LIMIT_WINDOW_MS, UPLOAD_RATE_LIMIT_MAX);
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: "Too many uploads. Please wait a moment and try again." },
                { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
            );
        }

        // Reject on the declared size before reading the body into memory.
        const declaredLength = Number(req.headers.get("content-length"));
        if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
            return NextResponse.json({ error: "File is too large (25 MB maximum)." }, { status: 413 });
        }

        const arrayBuffer = await req.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES) {
            return NextResponse.json({ error: "File is too large (25 MB maximum)." }, { status: 413 });
        }
        const buffer = Buffer.from(arrayBuffer);

        await putObject(storagePath, buffer, contentType);

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error: any) {
        console.error("Upload error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
