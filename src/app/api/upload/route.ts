// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  // Replace this with your Gateway server's local LAN IP (e.g., 192.168.1.X) and port 9000
  endpoint: "http://192.168.1.11:9000", 
  region: "us-east-1",
  credentials: {
    accessKeyId: "minioCSC", // Keep your created user key here
    secretAccessKey: "system.out.print(minioCSC)" // Keep your created secret key here
  },
  forcePathStyle: true, // Mandatory for MinIO
});

export async function POST(req: NextRequest) {
  try {
    const bucketName = "studora";
    const storagePath = req.headers.get('x-storage-path');
    
    // 👇 Ensure the backend picks up the mapped header or defaults safely
    const contentType = req.headers.get('content-type') || 'application/octet-stream';

    if (!storagePath) {
      return NextResponse.json({ error: 'Missing x-storage-path header' }, { status: 400 });
    }

    const arrayBuffer = await req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

const s3Client = new S3Client({
  // 🚨 CHANGE THIS TO 9069! This routes directly to your container's port 9000 S3 API
  endpoint: "http://<YOUR_GATEWAY_SERVER_LAN_IP>:9069", 
  region: "us-east-1",
  credentials: {
    accessKeyId: "minioCSC",      
    secretAccessKey: "system.out.print(minioCSC)" 
  },
  forcePathStyle: true,
});

    return NextResponse.json({ success: true }, { status: 200 });
} catch (error: any) {
    console.error("--- S3 API ERROR BREAKDOWN ---");
    console.error("Message:", error.message);
    
    if (error.$response && error.$response.body) {
      try {
        const body = error.$response.body;
        let rawText = "";

        if (typeof body.on === 'function') {
          // It's a Node.js Readable Stream
          rawText = await new Promise((resolve, reject) => {
            let data = '';
            body.on('data', (chunk: any) => data += chunk.toString());
            body.on('end', () => resolve(data));
            body.on('error', (err: any) => reject(err));
          });
        } else if (typeof body[Symbol.asyncIterator] === 'function') {
          // It's an Async Iterable stream wrapper
          const chunks = [];
          for await (const chunk of body) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
          }
          rawText = Buffer.concat(chunks).toString('utf-8');
        } else {
          // Fallback string conversion if it's already an object/string
          rawText = String(body);
        }

        console.error("🚨 RAW RESPONSE FROM SERVER:\n", rawText);
      } catch (e: any) {
        console.error("Could not read response stream directly:", e.message);
      }
    }
    console.error("------------------------------");

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}