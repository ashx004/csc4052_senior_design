import { collection, addDoc, getDoc, getDocs, query, orderBy, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { db } from "../../library/firebase"; 
import { deleteDoc } from "firebase/firestore";

const BUCKET_NAME = "studora";

// Large files (esp. text-heavy PDFs) can blow up into hundreds of chunks
// during indexing — each needing its own contextualization + embedding call
// — which has caused real Cloudflare tunnel timeouts under sustained load.
// This caps it well before that becomes a problem. Exported so both upload
// UIs (course page + chat) can validate before ever calling this function.
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

// Kept in sync with SUPPORTED_DOCUMENT_TYPES in src/library/documentExtract.ts —
// duplicated as a plain array here (rather than imported) so this client
// bundle never pulls in server-only extraction code.
export const INDEXABLE_FILE_TYPES = [
  "pdf", "docx", "xlsx", "xls",
  "png", "jpg", "jpeg", "webp",
  "txt", "py", "js", "jsx", "ts", "tsx", "java", "go", "sql", "c", "cpp",
  "cs", "rs", "html", "css", "php", "rb", "kt", "swift", "sh", "asm",
];

interface UploadFileProps {
  userId: string;
  classDocId: string; // Course ID string from the URL route
  file: File;
  category: string;
}

const OCR_IMAGE_TYPES = ["png", "jpg", "jpeg", "webp"];

function fileExtensionFor(file: File): string {
  return file.name.split(".").pop()?.toLowerCase() || "";
}

async function uploadOcrPage(
  userId: string,
  courseId: string,
  resourceId: string,
  file: File,
  order: number,
  displayName?: string
) {
  const fileExtension = fileExtensionFor(file);
  if (!OCR_IMAGE_TYPES.includes(fileExtension)) {
    throw new Error(`"${file.name}" is not a supported OCR image.`);
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)}MB) â€” the limit is 20MB.`);
  }

  const storagePath = `users/${userId}/classes/${courseId}/ocr-pages/${resourceId}/${Date.now()}_${order}_${file.name}`;
  const response = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-storage-path": storagePath,
    },
    body: await file.arrayBuffer(),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Failed to upload "${file.name}".`);
  }

  const pageUrl = `/api/download?key=${encodeURIComponent(storagePath)}`;
  const pageCollection = collection(db, "users", userId, "enrollment", courseId, "resources", resourceId, "pages");
  await addDoc(pageCollection, {
    name: displayName?.trim() || file.name,
    url: pageUrl,
    fileType: fileExtension,
    order,
    uploadedAt: serverTimestamp(),
    ocrStatus: "queued",
  });
}

async function queueOcrDocument(userId: string, courseId: string, resourceId: string) {
  const response = await fetch("/api/embed-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, courseId, resourceId }),
    keepalive: true,
  });
  if (!response.ok) throw new Error(`Failed to queue OCR document (${response.status}).`);
}

export async function uploadOcrDocument({
  userId,
  classDocId,
  files,
  category,
  name,
  pageNames,
}: {
  userId: string;
  classDocId: string;
  files: File[];
  category: string;
  name: string;
  pageNames?: string[];
}) {
  if (files.length === 0) throw new Error("Choose at least one image.");
  if (!files.every((file) => OCR_IMAGE_TYPES.includes(fileExtensionFor(file)))) {
    throw new Error("OCR documents can contain PNG, JPG, JPEG, or WEBP images only.");
  }

  const resourceCollection = collection(db, "users", userId, "enrollment", classDocId, "resources");
  const resource = await addDoc(resourceCollection, {
    name: name.trim() || "Untitled OCR document",
    url: "",
    fileType: "txt",
    resourceKind: "ocr_document",
    category,
    uploadedAt: serverTimestamp(),
    lastViewedAt: serverTimestamp(),
    ocrStatus: "queued",
    indexStatus: "queued",
    pageCount: 0,
    manualTranscript: false,
  });

  await Promise.all(files.map((file, index) =>
    uploadOcrPage(userId, classDocId, resource.id, file, index, pageNames?.[index])
  ));
  await updateDoc(resource, { pageCount: files.length, ocrStatus: "queued", indexStatus: "queued" });
  await queueOcrDocument(userId, classDocId, resource.id);
  return { success: true, id: resource.id };
}

export async function addOcrDocumentPages({
  userId,
  classDocId,
  resourceId,
  files,
  pageNames,
}: {
  userId: string;
  classDocId: string;
  resourceId: string;
  files: File[];
  pageNames?: string[];
}) {
  if (files.length === 0) return;
  const resourceRef = doc(db, "users", userId, "enrollment", classDocId, "resources", resourceId);
  const resource = await getDoc(resourceRef);
  if (!resource.exists() || resource.data().resourceKind !== "ocr_document") {
    throw new Error("OCR document not found.");
  }
  const pages = await getDocs(collection(resourceRef, "pages"));
  await Promise.all(files.map((file, index) =>
    uploadOcrPage(userId, classDocId, resourceId, file, pages.size + index, pageNames?.[index])
  ));
  await updateDoc(resourceRef, {
    pageCount: pages.size + files.length,
    manualTranscript: false,
    ocrStatus: "queued",
    indexStatus: "queued",
    vectorIndexed: false,
  });
  await queueOcrDocument(userId, classDocId, resourceId);
}

// ─── FUNCTION 1: UPLOAD A FILE ───
export const uploadUserResource = async ({ userId, classDocId, file, category }: UploadFileProps) => {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)}MB) — the limit is 20MB.`);
  }

  const fileExtension = fileExtensionFor(file);
  const uniqueFileName = `${Date.now()}_${file.name}`;
  const storagePath = `users/${userId}/classes/${classDocId}/${uniqueFileName}`;

  try {
    const fileBuffer = await file.arrayBuffer();

    const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'x-storage-path': storagePath,
        },
        body: fileBuffer,
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || 'Failed to upload file via server proxy');
    }

    const directFileUrl = `/api/download?key=${encodeURIComponent(storagePath)}`;
    const resourcesCollectionRef = collection(db, "users", userId, "enrollment", classDocId, "resources");
    
    const newDoc = await addDoc(resourcesCollectionRef, {
      name: file.name,
      url: directFileUrl,
      fileType: fileExtension,
      category: category,
      uploadedAt: serverTimestamp(),
      lastViewedAt: serverTimestamp()
    });

    // Fire-and-forget: index the document for semantic search.
    // Not awaited so upload doesn't wait on embedding, which can take a while.
    // keepalive is required here — without it, the browser cancels this
    // request the moment the user navigates away (e.g. to view the
    // document they just uploaded), which is almost immediate after an
    // upload — so indexing was silently never completing.
    if (INDEXABLE_FILE_TYPES.includes(fileExtension)) {
      fetch("/api/embed-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, courseId: classDocId, resourceId: newDoc.id }),
        keepalive: true,
      }).catch((error) => console.error("Background document indexing failed:", error));
    }

    return { success: true, id: newDoc.id, url: directFileUrl };
  } catch (error) {
    console.error("Asset upload sequence aborted:", error);
    throw error;
  }
};

// ─── FUNCTION 2: PULL FILES FOR THIS COURSE ───
export const getCourseResources = async (userId: string, classDocId: string) => {
  try {
    const resourcesCollectionRef = collection(db, "users", userId, "enrollment", classDocId, "resources");
    
    // Query files sorted by upload date (newest first)
    const q = query(resourcesCollectionRef, orderBy("uploadedAt", "desc"));
    const querySnapshot = await getDocs(q);
    
    const resources: any[] = [];
    querySnapshot.forEach((doc) => {
      resources.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return resources;
  } catch (error) {
    console.error("Error fetching course resources:", error);
    throw error;
  }
};


export const deleteUserResource = async (
    userId: string,
    classDocId: string,
    resourceId: string,
    storageKey: string
) => {
    await fetch(`/api/delete?key=${encodeURIComponent(storageKey)}&resourceId=${encodeURIComponent(resourceId)}`, { method: "DELETE" });
    const docRef = doc(db, "users", userId, "enrollment", classDocId, "resources", resourceId);
    await deleteDoc(docRef);
};
