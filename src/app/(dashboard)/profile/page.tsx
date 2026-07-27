"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Pencil, Save, X, Loader2, Trash2 } from "lucide-react";

import { useAuth } from "@/src/context/AuthContext";
import { useAdvisingCache } from "@/src/context/AdvisingCacheContext";
import {
  getStudentProfile,
  clearStudentProfile,
  StudentProfile,
} from "@/src/library/studentProfile";
import ClassCard, { ClassCardProps } from "@/src/components/classes/ClassCard";
import { getAllEnrollments } from "@/src/library/enrollments";

import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/src/library/firebase";

const SEARCH_DEBOUNCE_MS = 300;

type UniversitySuggestion = {
  name: string;
  country: string;
  domain: string;
  webPage: string;
};
type SelectedUniversity = { name: string; domain: string };

// Keyless Google favicon service — no API key/signup needed, matches the
// same URL format used server-side in src/library/universityDirectory.ts.
// Not importing that module here since it also contains a server-only
// fetch helper with no reason to enter the client bundle.
function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

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
      <label htmlFor={name} className="text-xs font-medium text-text-muted">
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
        <p className="mt-1 text-sm">{value || "N/A"}</p>
      )}
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const advisingCache = useAdvisingCache();

  // --- "What Catalyst has learned about you" summary panel ---
  const [catalystProfile, setCatalystProfile] = useState<StudentProfile | null>(null);
  const [catalystLoading, setCatalystLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  // --- University picker ---
  const [university, setUniversity] = useState<SelectedUniversity | null>(null);
  const [universityLoading, setUniversityLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [suggestions, setSuggestions] = useState<UniversitySuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [savingUniversity, setSavingUniversity] = useState(false);

  // --- Editable personal information (Firestore-backed) ---
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

  // --- Current classes ---
  const [enrollments, setEnrollments] = useState<ClassCardProps[]>([]);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(true);
  const [showClasses, setShowClasses] = useState(true);

  // Load the Catalyst-generated learning summary
  useEffect(() => {
    if (!user) {
      setCatalystLoading(false);
      return;
    }

    getStudentProfile(user.uid)
      .then(setCatalystProfile)
      .finally(() => setCatalystLoading(false));
  }, [user]);

  // Load the saved university
  useEffect(() => {
    if (!user) {
      setUniversityLoading(false);
      return;
    }

    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        const data = snap.data();
        if (data?.universityDomain) {
          setUniversity({
            name: data.universityName ?? data.universityDomain,
            domain: data.universityDomain,
          });
        }
      })
      .catch((error) => console.error("Failed to load university:", error))
      .finally(() => setUniversityLoading(false));
  }, [user]);

  // Debounced university search
  useEffect(() => {
    const query = searchInput.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const handle = setTimeout(() => {
      fetch(`/api/universities/search?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => setSuggestions(data.results ?? []))
        .catch(() => setSuggestions([]));
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [searchInput]);

  // Load editable personal info from Firestore
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

  // Load current classes
  useEffect(() => {
    if (!user) {
      setEnrollments([]);
      setEnrollmentsLoading(false);
      return;
    }

    setEnrollmentsLoading(true);
    getAllEnrollments(user.uid)
      .then(setEnrollments)
      .catch((error) => {
        console.error("Error loading profile classes:", error);
        setEnrollments([]);
      })
      .finally(() => setEnrollmentsLoading(false));
  }, [user]);

  async function selectUniversity(suggestion: UniversitySuggestion) {
    if (!user) return;
    setSavingUniversity(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        universityName: suggestion.name,
        universityDomain: suggestion.domain,
      });
      setUniversity({ name: suggestion.name, domain: suggestion.domain });
      setSearchInput("");
      setSuggestions([]);
      setShowSuggestions(false);
      // A stale cached "previous school" default view shouldn't flash before
      // the next Advising visit reflects the new school.
      advisingCache.clear();
    } catch (error) {
      console.error("Failed to save university:", error);
      alert("Failed to save your university. Please try again.");
    } finally {
      setSavingUniversity(false);
    }
  }

  async function handleClear() {
    if (!user) return;
    setClearing(true);

    try {
      await clearStudentProfile(user.uid);
      setCatalystProfile(null);
    } catch (error) {
      console.error("Error clearing learning profile:", error);
      alert("Your learning profile could not be cleared.");
    } finally {
      setClearing(false);
      setConfirmingClear(false);
    }
  }

  const handleProfileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;

    setProfile((currentProfile) => ({
      ...currentProfile,
      [name]: value,
    }));
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setProfileSaving(true);

    try {
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
          border-b border-border-light bg-bg-container px-6"
      >
        <h1
          className="
            absolute left-1/2 -translate-x-1/2 text-center
            text-lg font-semibold tracking-[0.45em] text-text-main"
        >
          Profile.
        </h1>
      </header>

      <main className="flex flex-1 flex-col overflow-y-auto px-10 py-10">
        {/* University picker */}
        <section className="w-full xl:w-1/2">
          <h2 className="text-lg font-semibold">Your university</h2>
          <p className="mt-1 text-sm text-text-muted">
            Used to personalize Advising&apos;s course recommendations. We
            currently have detailed course-offering data for Louisiana Tech
            University only — other schools will show a &quot;not supported
            yet&quot; message on Advising until we add more.
          </p>

          <div className="relative mt-4 rounded-lg border border-border-light bg-bg-container p-6">
            {universityLoading ? (
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Loader2 size={16} className="animate-spin" /> Loading...
              </div>
            ) : (
              <>
                {university && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg border border-border-light bg-bg-main p-3">
                    <img
                      src={faviconUrl(university.domain)}
                      alt=""
                      className="h-6 w-6 rounded"
                    />
                    <span className="text-sm text-text-main">
                      {university.name}
                    </span>
                  </div>
                )}
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  disabled={savingUniversity}
                  placeholder={
                    university
                      ? "Search to change your university..."
                      : "Search for your university..."
                  }
                  className="w-full rounded-md border border-border-light bg-bg-main px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none disabled:opacity-60"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-56 w-[calc(100%-3rem)] overflow-y-auto rounded-md border border-border-light bg-bg-main shadow-lg">
                    {suggestions.map((s) => (
                      <li key={`${s.name}-${s.domain}`}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectUniversity(s)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-bg-warm"
                        >
                          <img
                            src={faviconUrl(s.domain)}
                            alt=""
                            className="h-4 w-4 rounded"
                          />
                          <span className="text-text-main">{s.name}</span>
                          {s.country && (
                            <span className="text-xs text-text-muted">
                              {s.country}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </section>

        {/* Catalyst learning summary */}
        <section className="mt-10 w-full xl:w-1/2">
          <h2 className="text-lg font-semibold text-text-main">
            What Catalyst has learned about you
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Every so often, Catalyst updates a short, private summary of your
            academic goals and how you learn best, so it can tailor
            explanations without you having to repeat yourself. It only
            covers your studies — nothing personal. You can view or clear it
            here at any time.
          </p>

          <div className="mt-4 rounded-lg border border-border-light bg-bg-container p-6">
            {catalystLoading ? (
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Loader2 size={16} className="animate-spin" /> Loading...
              </div>
            ) : catalystProfile?.summary ? (
              <>
                <div className="rounded-lg border border-border-light bg-bg-main p-4 text-sm leading-relaxed text-text-main">
                  {catalystProfile.summary}
                </div>
                {catalystProfile.updatedAt && (
                  <p className="mt-2 text-xs text-text-muted">
                    Last updated{" "}
                    {catalystProfile.updatedAt.toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                )}

                {confirmingClear ? (
                  <div className="mt-4 flex items-center gap-3 rounded-lg border border-alert-error-bg bg-alert-error-bg p-3">
                    <p className="flex-1 text-sm text-alert-error">
                      Clear everything Catalyst has learned about you? This
                      can&apos;t be undone.
                    </p>
                    <button
                      type="button"
                      onClick={handleClear}
                      disabled={clearing}
                      className="rounded-md bg-alert-error px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-alert-error-hover disabled:opacity-50"
                    >
                      {clearing ? "Clearing..." : "Yes, clear it"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfirmingClear(false)}
                      disabled={clearing}
                      className="rounded-md border border-border-light px-3 py-1.5 text-xs font-medium text-text-muted hover:border-border-hover"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingClear(true)}
                    className="mt-4 flex items-center gap-1.5 text-xs font-medium text-alert-error hover:text-alert-error-hover"
                  >
                    <Trash2 size={14} /> Clear my learning profile
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm text-text-muted">
                Nothing yet — Catalyst builds this up gradually as you use the
                AI chat.
              </p>
            )}
          </div>
        </section>

        {/* Editable personal information */}
        <section className="mt-10 w-full xl:w-1/2">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Personal Information</h2>

            {!isEditingProfile ? (
              <button
                type="button"
                onClick={() => setIsEditingProfile(true)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-bg-warm"
              >
                <Pencil size={17} />
                Edit
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-bg-warm"
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
              {/* Read-only Firestore fields */}
              <div>
                <p className="text-xs font-medium text-text-muted">Name</p>
                <p className="mt-1 text-sm">{profile.name || "N/A"}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-text-muted">Email</p>
                <p className="mt-1 text-sm">{profile.email || "N/A"}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-text-muted">Role</p>
                <p className="mt-1 text-sm">{profile.role || "N/A"}</p>
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

        {/* Current classes */}
        <section className="mt-10">
          <button
            type="button"
            onClick={() => setShowClasses((currentValue) => !currentValue)}
            className="mb-4 flex items-center gap-2 text-lg font-semibold"
            aria-expanded={showClasses}
          >
            Current Classes
            <ChevronDown
              size={20}
              className={`transition-transform duration-200 ${
                showClasses ? "rotate-0" : "-rotate-90"
              }`}
            />
          </button>

          {enrollmentsLoading && (
            <p className="text-sm text-text-muted">Loading classes...</p>
          )}

          {!enrollmentsLoading && showClasses && enrollments.length === 0 && (
            <p className="text-sm text-text-muted">No current classes found.</p>
          )}

          {!enrollmentsLoading && showClasses && enrollments.length > 0 && (
            <div className="flex flex-wrap gap-5">
              {enrollments.map((enrollment, index) => (
                <ClassCard
                  key={enrollment.classId}
                  {...enrollment}
                  variant="compact"
                  color={
                    enrollment.color ?? (index % 2 === 0 ? "#d8cbbb" : "#bdb4a9")
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