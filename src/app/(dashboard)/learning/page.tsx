'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import Link from 'next/link';
import { Briefcase, Brain, Zap, Loader2 } from 'lucide-react';

interface EnrolledClass {
  id: string;
  classCode: string;
  className: string;
  term: string;
}

export default function LearningPage() {
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
      <div className="flex items-center justify-center min-h-screen bg-[#FAFAF8]">
        <Loader2 size={32} className="animate-spin text-[#8B6914]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#FAFAF8] px-4">
      {/* Brain icon + heading */}
      <div className="flex flex-col items-center mb-10">
        <div className="relative mb-2">
          <Brain size={44} className="text-[#8B6914]" />
          <Zap
            size={18}
            className="text-[#8B6914] absolute -top-1 -left-2 fill-[#8B6914]"
          />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-[#1a1a2e] tracking-tight">
          What Do You Want To Learn Today ?
        </h1>
      </div>

      {/* Class cards */}
      {classes.length === 0 ? (
        <div className="text-center text-gray-400">
          <Briefcase size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No classes enrolled</p>
          <p className="text-sm mt-1">
            Add classes from the{' '}
            <Link href="/classes" className="text-[#8B6914] underline">
              Classes
            </Link>{' '}
            page to start learning
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-4 w-full max-w-4xl">
          {classes.map((cls) => (
            <Link
              key={cls.id}
              href={`/courses/${cls.id}/learning`}
              className="block w-52 bg-[#F0EDE8] hover:bg-[#E8E4DD] rounded-lg p-5 transition-colors"
            >
              <Briefcase size={22} className="text-[#8B6914] mb-3" />
              <h2 className="text-sm font-bold text-[#1a1a2e]">{cls.classCode}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {cls.className}<span className="ml-0.5">→</span>
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}