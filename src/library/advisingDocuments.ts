import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getMinioClient } from "@/src/library/minioClient";

// download the pdfs from minIO //

const BUCKET_NAME = "studora";

type AdvisingDocumentType = "transcript" | "curriculum";

function getStoragePath(userId: string, documentType: AdvisingDocumentType): string {
  return `users/${userId}/advising/${documentType}.pdf`;
}

export async function getAdvisingDocumentBuffer(
  userId: string,
  documentType: AdvisingDocumentType
): Promise<Buffer> {
  const minioClient = await getMinioClient();
  const storagePath = getStoragePath(userId, documentType);

  const response = await minioClient.send(
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: storagePath,
    })
  );

  if (!response.Body) {
    throw new Error(
      `${documentType} could not be read from storage.`
    );
  }

  const bytes = await response.Body.transformToByteArray();

  return Buffer.from(bytes);
}