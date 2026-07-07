// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT, // e.g. "http://192.168.1.11:9069"
    region: "us-east-1",
    credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY!,
        secretAccessKey: process.env.MINIO_SECRET_KEY!,
    },
    forcePathStyle: true, // required for MinIO
    tls: true,
});

export async function POST(req: NextRequest) {
    try {
        const bucketName = "studora";
        const storagePath = req.headers.get('x-storage-path');
        const contentType = req.headers.get('content-type') || 'application/octet-stream';

        if (!storagePath) {
            return NextResponse.json({ error: 'Missing x-storage-path header' }, { status: 400 });
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
