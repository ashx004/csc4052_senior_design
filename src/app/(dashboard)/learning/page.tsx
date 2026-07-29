'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/src/context/AuthContext';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import Link from 'next/link';
import { Briefcase, GraduationCap, Loader2 } from 'lucide-react';

interface EnrolledClass {
  id: string;
  classCode: string;
  className: string;
  term: string;
}

export default function LearningPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [classes, setClasses] = useState<EnrolledClass[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchClasses = async () => {
      try {
        const enrollmentRef = collection(db, 'users', user.uid, 'enrollment');
        const querySnapshot = await getDocs(enrollmentRef);
        const enrolled: EnrolledClass[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          enrolled.push({
            id: doc.id,
            classCode: data.classCode || '',
            className: data.className || '',
            term: data.term || '',
          });
        });
        setClasses(enrolled);
      } catch (error) {
        console.error('Error fetching enrollments:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchClasses();
  }, [user, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-main">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-main px-6 py-10 sm:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl flex-col justify-center">
        <h1 className="mb-8 text-center text-2xl font-bold tracking-tight text-text-main md:text-3xl">
          Choose a class to get started.
        </h1>

        {classes.length === 0 ? (
          <div className="py-16 text-center text-text-muted">
            <Briefcase size={48} className="mx-auto mb-4 opacity-50" />

            <p className="text-lg font-medium text-text-main">
              No classes enrolled yet. Add a class to get started.
            </p>

            <Link
              href="/classes"
              className="mt-4 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
            >
              Go to Classes
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((cls) => (
              <button
                key={cls.id}
                onClick={() => router.push(`/courses/${cls.id}/learning`)}
                className="rounded-xl bg-bg-container p-6 text-left shadow-sm ring-1 ring-border-light transition-all hover:shadow-md hover:ring-primary"
              >
                <GraduationCap size={22} className="mb-3 text-primary" />

                <h2 className="text-sm font-semibold text-text-main">
                  {cls.className || 'Untitled class'}
                </h2>

                <p className="mt-1 text-sm text-text-muted">
                  {cls.classCode}
                </p>

                {cls.term && (
                  <p className="mt-0.5 text-xs text-text-muted">
                    {cls.term}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}