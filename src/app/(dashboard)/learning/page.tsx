'use client';

import Link from 'next/link';
import { Briefcase, Brain, Zap } from 'lucide-react';

// Mock data — will be replaced with Firestore enrollment data in Phase 2
const mockClasses = [
  { id: 'csc-131', code: 'CSC 131', name: 'Class Name' },
  { id: 'math-241', code: 'MATH 241', name: 'Class Name' },
  { id: 'engl-102', code: 'ENGL 102', name: 'Class Name' },
  { id: 'comm-101', code: 'COMM 101', name: 'Class Name' },
];

export default function LearningPage() {
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-4xl">
        {mockClasses.map((cls) => (
          <Link
            key={cls.id}
            href={`/courses/${cls.id}/learning`}
            className="block bg-[#F0EDE8] hover:bg-[#E8E4DD] rounded-lg p-5 transition-colors"
          >
            <Briefcase size={22} className="text-[#8B6914] mb-3" />
            <h2 className="text-sm font-bold text-[#1a1a2e]">{cls.code}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {cls.name}<span className="ml-0.5">→</span>
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}