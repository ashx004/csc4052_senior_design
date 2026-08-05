"use client";

import { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { EnrollmentFields } from '@/src/app/(dashboard)/classes/page';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import { Minus } from "lucide-react";
import { Term, parseCourseCode, getCurrentTerm } from '@/src/library/academicTerm';
import { randomClassColor } from '@/src/library/classColors';

const TERM_OPTIONS: Term[] = ["Fall", "Winter", "Spring", "Summer"];
const CLASS_CODE_DEBOUNCE_MS = 300;

type CourseSuggestion = { courseCode: string; title: string };

interface AddEnrollmentModalProps {
    onEnrollmentAdded?: () => void;
    deleteMode?: boolean;
    onToggleDeleteMode?: () => void;
    // Controlled-open override + prefill, so other pages (e.g. Advising's
    // "Add to my classes" action) can drive this modal without owning a
    // second copy of the form. All optional/backward compatible with the
    // Classes page's existing uncontrolled usage.
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    prefill?: { classCode: string; className: string };
    hideOwnTrigger?: boolean;
}

export default function AddEnrollmentModal({
      onEnrollmentAdded,
      deleteMode = false,
      onToggleDeleteMode = () => {},
      open,
      onOpenChange,
      prefill,
      hideOwnTrigger = false,
  }: AddEnrollmentModalProps) {
  const { user } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setIsOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  };
  const currentTerm = getCurrentTerm();

  const emptyFormData: EnrollmentFields = {
    className: '',
    classCode: '',
    term: '',
    time: '',
    facultyPhoneNumber: '',
    facultyOfficeNumber: '',
    facultyEmail: '',
    facultyName: '',
    classSchedule: '',
    prerequisites: '',
  };

  // Initialize state with empty strings for all fields
  const [formData, setFormData] = useState<EnrollmentFields>(emptyFormData);
  const [termSeason, setTermSeason] = useState<Term>(currentTerm.term);
  const [termYear, setTermYear] = useState<number>(currentTerm.year);
  const [courseSuggestions, setCourseSuggestions] = useState<CourseSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [creditHours, setCreditHours] = useState<string>("");

  // Handle generic input changes dynamically
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  // Debounced course-code/title autocomplete, backed by the same cached
  // course-offering catalog the Advising page uses (src/app/api/courses/search).
  useEffect(() => {
    const query = formData.classCode.trim();
    if (query.length < 2) {
      setCourseSuggestions([]);
      return;
    }

    const handle = setTimeout(() => {
      fetch(`/api/courses/search?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => setCourseSuggestions(data.results ?? []))
        .catch(() => setCourseSuggestions([]));
    }, CLASS_CODE_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [formData.classCode]);

  // Seed the form when a prefill is handed in (e.g. Advising's "Add to my
  // classes" action). Depends on the primitive values, not the `prefill`
  // object reference — callers that construct a new prefill object literal
  // on every render (as Advising's page does) would otherwise re-trigger
  // this effect on every parent re-render and silently overwrite whatever
  // the student had already typed into these two fields.
  useEffect(() => {
    if (!prefill) return;
    setFormData((prev) => ({ ...prev, classCode: prefill.classCode, className: prefill.className }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.classCode, prefill?.className]);

  const selectSuggestion = (suggestion: CourseSuggestion) => {
    setFormData((prev) => ({ ...prev, classCode: suggestion.courseCode, className: suggestion.title }));
    setShowSuggestions(false);
    setCourseSuggestions([]);
  };

  // Reset form when closing
  const handleClose = () => {
    setIsOpen(false);
    setFormData(emptyFormData);
    setTermSeason(currentTerm.term);
    setTermYear(currentTerm.year);
    setCourseSuggestions([]);
    setShowSuggestions(false);
    setCreditHours("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!user) {
      alert("You must be logged in to add a class.");
      return;
    }

    if (!formData.className || !formData.classCode || !termSeason || !termYear) {
      alert("Class Name, Class Code, and Term are required!");
      return;
    }

    // Structured season/year drive the display term string, and the class
    // code is best-effort split into subject/number — both are additive:
    // if parsing the code fails, subject/courseNumber stay unset and readers
    // fall back to parsing the free-text classCode themselves.
    const parsedCode = parseCourseCode(formData.classCode);
    const parsedCreditHours = parseFloat(creditHours);
    const savedEnrollmentData: EnrollmentFields = {
      ...formData,
      term: `${termSeason} ${termYear}`,
      termSeason,
      termYear,
      color: randomClassColor(),
      ...(parsedCode ? { subject: parsedCode.subject, courseNumber: parsedCode.number } : {}),
      ...(Number.isFinite(parsedCreditHours) ? { creditHours: parsedCreditHours } : {}),
    };

    try {
      const enrollmentRef = collection(db, "users", user.uid, "enrollment");
      await addDoc(enrollmentRef, savedEnrollmentData);
      
      if (onEnrollmentAdded) {
        onEnrollmentAdded();
      }
    } catch (error) {
      console.error("Error adding enrollment: ", error);
      alert("Failed to add class. Please try again.");
      return;
    }

    handleClose();
  };

  return (
    <>
      {!hideOwnTrigger && (
        <>
          <button
            onClick={() => setIsOpen(true)}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-md bg-green-500 text-text-inverse shadow hover:bg-green-600"
            aria-label="Add class"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={onToggleDeleteMode}
            className={`absolute top-4 right-16 flex h-8 w-8 items-center justify-center rounded-md shadow transition-colors ${
                deleteMode ? "bg-red-500 text-text-inverse" : "bg-bg-container text-text-muted hover:bg-bg-warm"
            }`}
            aria-label="Toggle delete mode"
        >
            <Minus size={18} />
        </button>
        </>
      )}

      { /* render the modal iff isOpen is true */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-lg bg-bg-container p-6 shadow-xl transition-all max-h-[90vh] overflow-y-auto">
            {/* Top label */}
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="text-xl font-semibold text-text-main">Add New Class</h3>
              {/* close modal button -- top right */}
              <button onClick={handleClose} className="text-text-muted hover:text-text-main">✕</button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Required Section */}
              <div className="border-b pb-2">
                <span className="text-xs font-bold uppercase text-red-500">Required Information</span>
              </div>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-text-muted">Class Name *</label>
                  <input
                    type="text"
                    name="className"
                    required
                    value={formData.className}
                    onChange={handleChange}
                    className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-green-500 focus:outline-none"
                    placeholder="e.g. Introduction to Databases"
                  />
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-text-muted">Class Code *</label>
                  <input
                    type="text"
                    name="classCode"
                    required
                    autoComplete="off"
                    value={formData.classCode}
                    onChange={handleChange}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-green-500 focus:outline-none"
                    placeholder="e.g. CS 304"
                  />
                  {showSuggestions && courseSuggestions.length > 0 && (
                    <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border-light bg-bg-container shadow-lg">
                      {courseSuggestions.map((suggestion) => (
                        <li key={suggestion.courseCode}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectSuggestion(suggestion)}
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-bg-warm"
                          >
                            <span className="font-medium text-text-main">{suggestion.courseCode}</span>{" "}
                            <span className="text-text-muted">{suggestion.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted">Term *</label>
                  <select
                    name="termSeason"
                    required
                    value={termSeason}
                    onChange={(e) => setTermSeason(e.target.value as Term)}
                    className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-green-500 focus:outline-none"
                  >
                    {TERM_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted">Year *</label>
                  <input
                    type="number"
                    name="termYear"
                    required
                    value={termYear}
                    onChange={(e) => setTermYear(parseInt(e.target.value, 10) || currentTerm.year)}
                    className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-green-500 focus:outline-none"
                    placeholder="e.g. 2026"
                  />
                </div>
              </div>

              {/* --- Optional Section --- */}
              <div className="border-b pb-2 pt-2">
                <span className="text-xs font-bold uppercase text-text-muted">Optional Schedule & Faculty Info</span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-text-muted">Time</label>
                  <input
                    type="text"
                    name="time"
                    value={formData.time}
                    onChange={handleChange}
                    className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-green-500 focus:outline-none"
                    placeholder="e.g. 10:00 AM - 11:30 AM"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted">Class Schedule</label>
                  <input
                    type="text"
                    name="classSchedule"
                    value={formData.classSchedule}
                    onChange={handleChange}
                    className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-green-500 focus:outline-none"
                    placeholder="e.g. Mon / Wed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted">Credit Hours</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={creditHours}
                    onChange={(e) => setCreditHours(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-green-500 focus:outline-none"
                    placeholder="e.g. 3"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-text-muted">Prerequisites</label>
                  <input
                    type="text"
                    name="prerequisites"
                    value={formData.prerequisites}
                    onChange={handleChange}
                    className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-green-500 focus:outline-none"
                    placeholder="e.g. CSC 200, MATH 101 (self-reported — no catalog to validate against)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted">Faculty Name</label>
                  <input
                    type="text"
                    name="facultyName"
                    value={formData.facultyName}
                    onChange={handleChange}
                    className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-green-500 focus:outline-none"
                    placeholder="Dr. Smith"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted">Faculty Email</label>
                  <input
                    type="email"
                    name="facultyEmail"
                    value={formData.facultyEmail}
                    onChange={handleChange}
                    className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-green-500 focus:outline-none"
                    placeholder="smith@university.edu"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted">Faculty Phone</label>
                  <input
                    type="text"
                    name="facultyPhoneNumber"
                    value={formData.facultyPhoneNumber}
                    onChange={handleChange}
                    className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-green-500 focus:outline-none"
                    placeholder="555-0199"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted">Faculty Office</label>
                  <input
                    type="text"
                    name="facultyOfficeNumber"
                    value={formData.facultyOfficeNumber}
                    onChange={handleChange}
                    className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-green-500 focus:outline-none"
                    placeholder="Tech Tower Room 402"
                  />
                </div>
              </div>

              {/* --- Actions --- */}
              <div className="mt-6 flex justify-end gap-3 border-t pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-md border border-border-light px-4 py-2 text-sm font-medium text-text-muted hover:bg-bg-warm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-green-500 px-4 py-2 text-sm font-medium text-text-inverse hover:bg-green-600 shadow-sm"
                >
                  Save Class
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </>
  );
}