import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "../../library/firebase"; 
import { doc, deleteDoc } from "firebase/firestore";

const BUCKET_NAME = "studora";

// Kept in sync with SUPPORTED_DOCUMENT_TYPES in src/library/documentExtract.ts —
// duplicated as a plain array here (rather than imported) so this client
// bundle never pulls in server-only extraction code.
const INDEXABLE_FILE_TYPES = [
  "pdf", "docx", "xlsx", "xls",
  "txt", "py", "js", "jsx", "ts", "tsx", "java", "go", "sql", "c", "cpp",
  "cs", "rs", "html", "css", "php", "rb", "kt", "swift", "sh", "asm",
];

interface UploadFileProps {
  userId: string;
  classDocId: string; // Course ID string from the URL route
  file: File;
  category: string;
}

// ─── FUNCTION 1: UPLOAD A FILE ───
export const uploadUserResource = async ({ userId, classDocId, file, category }: UploadFileProps) => {
  const fileExtension = file.name.split('.').pop()?.toLowerCase() || "";
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
    await fetch(`/api/delete?key=${encodeURIComponent(storageKey)}`, { method: "DELETE" });
    const docRef = doc(db, "users", userId, "enrollment", classDocId, "resources", resourceId);
    await deleteDoc(docRef);
};