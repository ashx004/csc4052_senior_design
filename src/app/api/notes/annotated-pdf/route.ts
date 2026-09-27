import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getMinioClient } from "@/src/library/minioClient";
import { verifyRequestAuth } from "@/src/library/verifyAuth";

export async function POST(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await request.formData();
    const noteId = form.get("noteId");
    const pages = form.getAll("page").filter((item): item is File => item instanceof File);
    if (typeof noteId !== "string" || !noteId || pages.length === 0 || pages.length > 50) return NextResponse.json({ error: "A note and 1–50 rendered pages are required." }, { status: 400 });
    const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const complete = new Promise<void>((resolve, reject) => { doc.on("end", resolve); doc.on("error", reject); });
    for (const page of pages) {
      const image = Buffer.from(await page.arrayBuffer());
      const size = (doc as unknown as { openImage: (data: Buffer) => { width: number; height: number } }).openImage(image);
      const width = 612;
      const height = Math.round((size.height / size.width) * width);
      doc.addPage({ size: [width, height], margin: 0 }).image(image, 0, 0, { width, height });
    }
    doc.end();
    await complete;
    const key = `users/${auth.uid}/notes/${noteId}/annotated.pdf`;
    const client = await getMinioClient();
    await client.send(new PutObjectCommand({ Bucket: "studora", Key: key, Body: Buffer.concat(chunks), ContentType: "application/pdf" }));
    return NextResponse.json({ url: `/api/download?key=${encodeURIComponent(key)}` });
  } catch (error) {
    console.error("Annotated PDF export failed:", error);
    return NextResponse.json({ error: "Couldn't save the annotated PDF." }, { status: 500 });
  }
}
