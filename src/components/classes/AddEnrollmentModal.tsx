"use client";

import { useState, ChangeEvent, FormEvent } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { EnrollmentFields } from '@/src/app/(dashboard)/classes/page';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import { Minus } from "lucide-react"; 

interface AddEnrollmentModalProps {
    onEnrollmentAdded?: () => void;
    deleteMode: boolean;
    onToggleDeleteMode: () => void;
}

export default function AddEnrollmentModal({
      onEnrollmentAdded,
      deleteMode,
      onToggleDeleteMode,
  }: AddEnrollmentModalProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  
  // Initialize state with empty strings for all fields
  const [formData, setFormData] = useState<EnrollmentFields>({
    className: '',
    classCode: '',
    term: '',
    time: '',
    facultyPhoneNumber: '',
    facultyOfficeNumber: '',
    facultyEmail: '',
    facultyName: '',
    classSchedule: ''
  });

  // Handle generic input changes dynamically
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  // Reset form when closing
  const handleClose = () => {
    setIsOpen(false);
    setFormData({
      className: '',
      classCode: '',
      term: '',
      time: '',
      facultyPhoneNumber: '',
      facultyOfficeNumber: '',
      facultyEmail: '',
      facultyName: '',
      classSchedule: ''
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!user) {
      alert("You must be logged in to add a class.");
      return;
    }

    if (!formData.className || !formData.classCode || !formData.term) {
      alert("Class Name, Class Code, and Term are required!");
      return;
    }

    const savedEnrollmentData: EnrollmentFields = { ...formData };    

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
      <button
        onClick={() => setIsOpen(true)}
        className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-md bg-green-500 text-white shadow hover:bg-green-600"
        aria-label="Add class"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
        </svg>
      </button>
      <button
        onClick={onToggleDeleteMode}
        className={`absolute top-4 right-16 flex h-8 w-8 items-center justify-center rounded-md shadow transition-colors ${
            deleteMode ? "bg-red-500 text-white" : "bg-white text-text-muted hover:bg-bg-warm"
        }`}
        aria-label="Toggle delete mode"
    >
        <Minus size={18} />
    </button>

      { /* render the modal iff isOpen is true */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl transition-all max-h-[90vh] overflow-y-auto">
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
                    className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                    placeholder="e.g. Introduction to Databases"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted">Class Code *</label>
                  <input
                    type="text"
                    name="classCode"
                    required
                    value={formData.classCode}
                    onChange={handleChange}
                    className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                    placeholder="e.g. CS 304"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-text-muted">Term *</label>
                  <input
                    type="text"
                    name="term"
                    required
                    value={formData.term}
                    onChange={handleChange}
                    className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                    placeholder="e.g. Fall 2026"
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
                    className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
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
                    className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                    placeholder="e.g. Mon / Wed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted">Faculty Name</label>
                  <input
                    type="text"
                    name="facultyName"
                    value={formData.facultyName}
                    onChange={handleChange}
                    className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
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
                    className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
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
                    className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
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
                    className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
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
                  className="rounded-md bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 shadow-sm"
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