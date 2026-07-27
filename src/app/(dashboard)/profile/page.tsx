"use client";

// import "@/src/components/classes/ClassCard.css";
// import Link from 'next/link';

import { useEffect, useState } from "react";
import { ChevronDown, Pencil, Save, X, } from "lucide-react";

import { useAuth } from "@/src/context/AuthContext";
import ClassCard, {ClassCardProps,} from "@/src/components/classes/ClassCard";
import { getAllEnrollments } from "@/src/library/enrollments";

import { doc, getDoc, setDoc,} from "firebase/firestore";
import { db } from "@/src/library/firebase";

interface UserProfile {
  email: string;
  name: string;
  role: string;
  studentId: string;
  major: string;
  expectedGraduation: string;
  status: string;
}

interface ProfileFieldProps {
  label: string;
  name: keyof UserProfile;
  value: string;
  isEditing: boolean;
  placeholder: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

function ProfileField({
  label,
  name,
  value,
  isEditing,
  placeholder,
  onChange,
}: ProfileFieldProps) {
  return (
    <div>
      <label
        htmlFor={name}
        className="text-xs font-medium text-text-muted"
      >
        {label}
      </label>

      {isEditing ? (
        <input
          id={name}
          name={name}
          type="text"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="
            mt-1 w-full rounded-md
            border border-border-light
            bg-bg-main px-3 py-2 text-sm
            outline-none
            focus:border-primary
            focus:ring-2 focus:ring-primary/20
          "
        />
      ) : (
        <p className="mt-1 text-sm">
          {value || "N/A"}
        </p>
      )}
    </div>
  );
}

export default function Profile() {

  const { user, loading } = useAuth();
  const [enrollments, setEnrollments] = useState<ClassCardProps[]>([]);
  const [showClasses, setShowClasses] = useState(true);
  const [profile, setProfile] = useState<UserProfile>({
    email: "",
    name: "",
    role: "",
    studentId: "",
    major: "",
    expectedGraduation: "",
    status: "",
  });
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);

  
  useEffect(() => {
    async function loadProfile() {
      if (!user) {
        setProfileLoading(false);
        return;
      }

      try {
        setProfileLoading(true);

        const userDocumentRef = doc(db, "users", user.uid);
        const userDocument = await getDoc(userDocumentRef);

        if (!userDocument.exists()) {
          console.log("User profile document was not found.");
          return;
        }

        const data = userDocument.data();

        setProfile({
          email: data.email ?? user.email ?? "",
          name: data.name ?? "",
          role: data.role ?? "",
          studentId: data.studentId ?? "",
          major: data.major ?? "",
          expectedGraduation: data.expectedGraduation ?? "",
          status: data.status ?? "",
        });
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setProfileLoading(false);
      }
    }

    loadProfile();
  }, [user]);



  // Loads current classes
  useEffect(() => {
    if (!user) {
      setEnrollments([]);
      return;
    }

    getAllEnrollments(user.uid)
      .then(setEnrollments)
      .catch((error) => {
        console.error("Error loading profile classes:", error);
        setEnrollments([]);
      });
      }, [user]);



  const handleProfileChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = event.target;

    setProfile((currentProfile) => ({
      ...currentProfile,
      [name]: value,
    }));
  };


  const handleSaveProfile = async () => {
    if (!user) return;

    try {
      setProfileSaving(true);

      const userDocumentRef = doc(db, "users", user.uid);

      await setDoc(
        userDocumentRef,
        {
          studentId: profile.studentId.trim(),
          major: profile.major.trim(),
          expectedGraduation: profile.expectedGraduation.trim(),
          status: profile.status.trim(),
        },
        { merge: true }
      );

      setIsEditingProfile(false);
    } catch (error) {
      console.error("Error saving profile:", error);
      alert("Your profile information could not be saved.");
    } finally {
      setProfileSaving(false);
    }
  };


  return (
    <section className="flex h-screen flex-col bg-bg-main text-text-main">
      <header
        className="
          relative flex h-[73px] shrink-0 items-center justify-between 
          border-b border-border-light bg-bg-container px-6" >
        <h1
          className="
            absolute left-1/2 -translate-x-1/2 text-center
            text-lg font-semibold tracking-[0.45em] text-text-main" >
          Profile.
        </h1>
      </header>

    <main className="flex flex-1 flex-col px-10 py-10">
            <section className="w-full xl:w-1/2">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Personal Information
                </h2>

                {!isEditingProfile ? (
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(true)}
                    className="
                      flex items-center gap-2 rounded-md px-3 py-2
                      text-sm hover:bg-bg-warm
                    "
                  >
                    <Pencil size={17} />
                    Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(false)}
                      className="
                        flex items-center gap-2 rounded-md px-3 py-2
                        text-sm hover:bg-bg-warm
                      "
                    >
                      <X size={17} />
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      disabled={profileSaving}
                      className="
                        flex items-center gap-2 rounded-md
                        bg-primary px-3 py-2 text-sm text-white
                        hover:bg-primary-hover
                        disabled:cursor-not-allowed disabled:opacity-60
                      "
                    >
                      <Save size={17} />
                      {profileSaving ? "Saving..." : "Save"}
                    </button>
                  </div>
                )}
              </div>

              {profileLoading ? (
                <p className="text-sm text-text-muted">
                  Loading personal information...
                </p>
              ) : (
                <div
                  className="
                    grid grid-cols-1 gap-x-10 gap-y-5
                    rounded-lg border border-border-light
                    bg-bg-container p-6
                    md:grid-cols-2
                  "
                >
                  {/* Existing, read-only Firestore fields */}

                  <div>
                    <p className="text-xs font-medium text-text-muted text-bold">
                      Name
                    </p>
                    <p className="mt-1 text-sm">
                      {profile.name || "N/A"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-text-muted">
                      Email
                    </p>
                    <p className="mt-1 text-sm">
                      {profile.email || "N/A"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-text-muted">
                      Role
                    </p>
                    <p className="mt-1 text-sm">
                      {profile.role || "N/A"}
                    </p>
                  </div>

                  {/* Editable fields */}

                  <ProfileField
                    label="Student ID"
                    name="studentId"
                    value={profile.studentId}
                    isEditing={isEditingProfile}
                    onChange={handleProfileChange}
                    placeholder="Enter your student ID"
                  />

                  <ProfileField
                    label="Major"
                    name="major"
                    value={profile.major}
                    isEditing={isEditingProfile}
                    onChange={handleProfileChange}
                    placeholder="Enter your major"
                  />

                  <ProfileField
                    label="Expected Graduation"
                    name="expectedGraduation"
                    value={profile.expectedGraduation}
                    isEditing={isEditingProfile}
                    onChange={handleProfileChange}
                    placeholder="Example: December 2026"
                  />

                  <ProfileField
                    label="Status"
                    name="status"
                    value={profile.status}
                    isEditing={isEditingProfile}
                    onChange={handleProfileChange}
                    placeholder="Example: Senior"
                  />
                </div>
              )}
            </section>

            <section className="mt-10">
              <button
                type="button"
                onClick={() => setShowClasses((currentValue) => !currentValue)}
                className="
                  mb-4 flex items-center gap-2
                  text-lg font-semibold
                "
                aria-expanded={showClasses}
              >
                Current Classes

                <ChevronDown
                  size={20}
                  className={`
                    transition-transform duration-200
                    ${showClasses ? "rotate-0" : "-rotate-90"}
                  `}
                />
              </button>

              {loading && (
                <p className="text-sm text-text-muted">
                  Loading classes...
                </p>
              )}

              {!loading && showClasses && enrollments.length === 0 && (
                <p className="text-sm text-text-muted">
                  No current classes found.
                </p>
              )}

              {!loading && showClasses && enrollments.length > 0 && (
                <div className="flex flex-wrap gap-5">
                  {enrollments.map((enrollment, index) => (
                    <ClassCard
                      key={enrollment.classId}
                      {...enrollment}
                      variant="compact"
                      color={
                        enrollment.color ??
                        (index % 2 === 0 ? "#d8cbbb" : "#bdb4a9")
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          </main>
        </section>
      );
    }
