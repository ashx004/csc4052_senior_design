import PDFDocument from "pdfkit";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT,
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true,
  tls: true,
});

// Minimal inline-markdown renderer (bold only) — chains styled segments on
// one pdfkit line via `continued`, since pdfkit has no rich-text markup input.
function renderInlineLine(doc: PDFKit.PDFDocument, text: string) {
  const segments = text.split(/(\*\*[^*]+\*\*)/g).filter((s) => s.length > 0);

  if (segments.length === 0) {
    doc.text("");
    return;
  }

  segments.forEach((segment, index) => {
    const isBold = segment.startsWith("**") && segment.endsWith("**");
    const content = isBold ? segment.slice(2, -2) : segment;
    const isLast = index === segments.length - 1;

    doc.font(isBold ? "Helvetica-Bold" : "Helvetica");
    doc.text(content, { continued: !isLast });
  });
}

// Basic markdown → PDF: headings, bullet/numbered lists, bold, paragraphs.
// Deliberately not a full CommonMark implementation — enough for structured
// study documents (exams, study guides) the model writes in plain markdown.
export function generatePdfBuffer(title: string, markdown: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 54, size: "LETTER" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(20).text(title, { align: "left" });
    doc.moveDown(1);
    doc.font("Helvetica").fontSize(11);

    for (const rawLine of markdown.split("\n")) {
      const line = rawLine.trimEnd();

      if (!line.trim()) {
        doc.moveDown(0.5);
        continue;
      }

      const h1 = line.match(/^#\s+(.*)/);
      const h2 = line.match(/^##\s+(.*)/);
      const h3 = line.match(/^###\s+(.*)/);
      const bullet = line.match(/^[-*]\s+(.*)/);
      const numbered = line.match(/^(\d+)\.\s+(.*)/);

      if (h1) {
        doc.moveDown(0.5).fontSize(16);
        renderInlineLine(doc, h1[1]);
        doc.fontSize(11);
      } else if (h2) {
        doc.moveDown(0.5).fontSize(14);
        renderInlineLine(doc, h2[1]);
        doc.fontSize(11);
      } else if (h3) {
        doc.moveDown(0.3).fontSize(12);
        renderInlineLine(doc, h3[1]);
        doc.fontSize(11);
      } else if (bullet) {
        doc.font("Helvetica").fontSize(11).text("•  ", { continued: true });
        renderInlineLine(doc, bullet[1]);
      } else if (numbered) {
        doc.font("Helvetica").fontSize(11).text(`${numbered[1]}.  `, { continued: true });
        renderInlineLine(doc, numbered[2]);
      } else {
        doc.font("Helvetica").fontSize(11);
        renderInlineLine(doc, line);
      }
    }

    doc.end();
  });
}

function sanitizeFilename(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 60);
  return cleaned || "document";
}

export async function generateAndUploadPdf(
  userId: string,
  title: string,
  markdown: string
): Promise<{ name: string; url: string }> {
  const buffer = await generatePdfBuffer(title, markdown);
  const fileName = `${sanitizeFilename(title)}.pdf`;
  const storagePath = `users/${userId}/generated/${Date.now()}_${fileName}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: "studora",
      Key: storagePath,
      Body: buffer,
      ContentType: "application/pdf",
    })
  );

  return {
    name: fileName,
    url: `/api/download?key=${encodeURIComponent(storagePath)}`,
  };
}
