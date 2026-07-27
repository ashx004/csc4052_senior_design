// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { getMinioClient } from "@/src/library/minioClient";

const s3Client = getMinioClient();

export async function POST(req: NextRequest) {
    try {
        const bucketName = "studora";
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

        const arrayBuffer = await req.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await s3Client.send(
            new PutObjectCommand({
                Bucket: bucketName,
                Key: storagePath,
                Body: buffer,
                ContentType: contentType,
            })
        );

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error: any) {
        console.error("Upload error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
