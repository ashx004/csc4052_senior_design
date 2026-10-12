import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc, type Firestore } from 'firebase/firestore';
import type { PersistDeps } from './persistStudySet';

export function liveDeps(db: Firestore, uid: string, courseId: string): PersistDeps {
  const base = ['users', uid, 'enrollment', courseId] as const;
  return {
    uid,
    courseId,
    listSets: async (collectionName) => {
      const snap = await getDocs(collection(db, ...base, collectionName));
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
    },
    addSet: async (collectionName, data) => {
      const ref = await addDoc(collection(db, ...base, collectionName), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return ref.id;
    },
    updateSet: async (collectionName, id, data) => {
      await updateDoc(doc(db, ...base, collectionName, id), { ...data, updatedAt: serverTimestamp() });
    },
  };
}
