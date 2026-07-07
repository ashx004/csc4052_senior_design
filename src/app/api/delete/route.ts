import { NextRequest, NextResponse } from 'next/server';
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT,
    region: "us-east-1",
    credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY!,
        secretAccessKey: process.env.MINIO_SECRET_KEY!,
    },
    forcePathStyle: true,
});

export async function DELETE(req: NextRequest) {
    const key = req.nextUrl.searchParams.get("key");
    if (!key) {
        return NextResponse.json({ error: "Missing key" }, { status: 400 });
    }

    try {
        await s3Client.send(new DeleteObjectCommand({ Bucket: "studora", Key: key }));
        return NextResponse.json({ success: true }, { status: 200 });
    } catch (err: any) {
        console.error("Delete error:", err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}