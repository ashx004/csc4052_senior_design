// One-time migration: upsert every existing Firestore chunk (text +
// embedding already sit there verbatim from prior indexing runs) into
// Qdrant, and mark each resource vectorIndexed so api/chat/route.ts's
// searchDocuments routes it to the fast path instead of the Firestore
// brute-force fallback. Safe to re-run — skips resources already marked
// vectorIndexed, and Qdrant upserts are idempotent by point id.
//
// Run with: node --env-file=.env scripts/backfillQdrant.mjs
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { createHash } from "crypto";

// Must match src/library/vectorStore.ts's chunkPointId exactly — same
// deterministic UUID v5 derivation, so a chunk indexed live and the same
// chunk backfilled by this script always land on the same Qdrant point id.
const NAMESPACE = Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex");
function chunkPointId(resourceId, chunkIndex) {
  const hash = createHash("sha1")
    .update(Buffer.concat([NAMESPACE, Buffer.from(`${resourceId}_${chunkIndex}`)]))
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "studora-933f8.firebaseapp.com",
  databaseURL: "https://studora-933f8-default-rtdb.firebaseio.com",
  projectId: "studora-933f8",
  storageBucket: "studora-933f8.firebasestorage.app",
  messagingSenderId: "138752872821",
  appId: "1:138752872821:web:0b1e85d21e9d392fd8c33c",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION = "catalyst_chunks";
const BATCH_SIZE = 100;

async function upsertPoints(points) {
  if (points.length === 0) return;
  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "api-key": QDRANT_API_KEY },
    body: JSON.stringify({ points }),
  });
  if (!response.ok) {
    throw new Error(`Qdrant upsert failed (${response.status}): ${await response.text()}`);
  }
}

async function main() {
  if (!QDRANT_URL || !QDRANT_API_KEY) {
    console.error("QDRANT_URL / QDRANT_API_KEY not set — aborting.");
    process.exit(1);
  }

  let usersProcessed = 0;
  let resourcesMigrated = 0;
  let resourcesSkipped = 0;
  let chunksUpserted = 0;

  const usersSnap = await getDocs(collection(db, "users"));
  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    usersProcessed++;

    const enrollmentSnap = await getDocs(collection(db, "users", userId, "enrollment"));
    for (const enrollmentDoc of enrollmentSnap.docs) {
      const courseId = enrollmentDoc.id;

      const resourcesSnap = await getDocs(
        collection(db, "users", userId, "enrollment", courseId, "resources")
      );
      for (const resourceDoc of resourcesSnap.docs) {
        const resourceId = resourceDoc.id;
        const resourceData = resourceDoc.data();

        if (resourceData.vectorIndexed) {
          resourcesSkipped++;
          continue;
        }

        const chunksSnap = await getDocs(
          collection(db, "users", userId, "enrollment", courseId, "resources", resourceId, "chunks")
        );
        if (chunksSnap.empty) continue; // not indexed at all yet — nothing to backfill

        const points = [];
        chunksSnap.forEach((chunkDoc) => {
          const data = chunkDoc.data();
          if (!Array.isArray(data.embedding)) return;
          points.push({
            id: chunkPointId(resourceId, data.chunkIndex ?? points.length),
            vector: data.embedding,
            payload: {
              userId,
              courseId,
              resourceId,
              chunkIndex: data.chunkIndex ?? 0,
              text: data.text ?? "",
            },
          });
        });

        for (let i = 0; i < points.length; i += BATCH_SIZE) {
          await upsertPoints(points.slice(i, i + BATCH_SIZE));
          chunksUpserted += points.slice(i, i + BATCH_SIZE).length;
        }

        await updateDoc(resourceDoc.ref, { vectorIndexed: true });
        resourcesMigrated++;
        console.log(`Migrated "${resourceData.name ?? resourceId}" (${points.length} chunks)`);
      }
    }
  }

  console.log(
    `\nDone. Users scanned: ${usersProcessed}, resources migrated: ${resourcesMigrated}, already up to date: ${resourcesSkipped}, chunks upserted: ${chunksUpserted}.`
  );
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
