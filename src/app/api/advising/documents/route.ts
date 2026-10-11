import { NextRequest, NextResponse } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { getMinioClient } from "@/src/library/minioClient";

/* Lists the advising documents (transcript and curriculum sheet) the signed-in
student has uploaded to MinIO. Each entry says whether the file is actually
there, so the page can show a "not available" message for a missing one. The
file itself is fetched through /api/download, which checks ownership. */

export const dynamic = "force-dynamic";

const BUCKET_NAME = "studora";

const ADVISING_DOCUMENTS = [
  { type: "transcript", label: "Transcript" },
  { type: "curriculum", label: "Curriculum Sheet" },
] as const;

export type AdvisingDocument = {
  type: (typeof ADVISING_DOCUMENTS)[number]["type"];
  label: string;
  storagePath: string;
  available: boolean;
  size: number | null;
  lastModified: string | null;
};

export async function GET(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const minioClient = await getMinioClient();

    const documents: AdvisingDocument[] = await Promise.all(
      ADVISING_DOCUMENTS.map(async ({ type, label }) => {
        const storagePath = `users/${auth.uid}/advising/${type}.pdf`;

        try {
          const head = await minioClient.send(
            new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: storagePath })
          );

          return {
            type,
            label,
            storagePath,
            available: true,
            size: head.ContentLength ?? null,
            lastModified: head.LastModified?.toISOString() ?? null,
          };
        } catch {
          // HeadObject throws when the object doesn't exist.
          return {
            type,
            label,
            storagePath,
            available: false,
            size: null,
            lastModified: null,
          };
        }
      })
    );

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("Could not list advising documents:", error);

    return NextResponse.json(
      { error: "Your advising documents could not be loaded." },
      { status: 500 }
    );
  }
}
