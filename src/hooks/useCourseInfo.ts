"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { useAuth } from "@/src/context/AuthContext";

interface CourseInfo {
  courseCode: string;
  className: string;
  displayName: string;
  loading: boolean;
}

export function useCourseInfo(courseId: string): CourseInfo {
  const { user, loading: authLoading } = useAuth();
  const [courseCode, setCourseCode] = useState("");
  const [className, setClassName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setCourseCode("");
      setClassName("");
      setLoading(false);
      return;
    }

    setLoading(true);

    const docRef = doc(db, "users", user.uid, "enrollment", courseId);
    getDoc(docRef)
      .then((docSnap) => {
        if (!docSnap.exists()) {
          setCourseCode("");
          setClassName("");
          return;
        }

        const data = docSnap.data();
        setCourseCode(data.classCode ?? "");
        setClassName(data.className ?? "");
      })
      .catch((error) => {
        console.error("Error fetching course info:", error);
        setCourseCode("");
        setClassName("");
      })
      .finally(() => setLoading(false));
  }, [user, authLoading, courseId]);

  const displayName =
    courseCode && className
      ? `${courseCode} - ${className}`
      : courseCode || className || courseId;

  return { courseCode, className, displayName, loading };
}
