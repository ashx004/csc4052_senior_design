"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { useAdvisingCache } from "@/src/context/AdvisingCacheContext";
import { getStudentProfile, clearStudentProfile, StudentProfile } from "@/src/library/studentProfile";

const SEARCH_DEBOUNCE_MS = 300;

type UniversitySuggestion = { name: string; country: string; domain: string; webPage: string };
type SelectedUniversity = { name: string; domain: string };

// Keyless Google favicon service — no API key/signup needed, matches the
// same URL format used server-side in src/library/universityDirectory.ts.
// Not importing that module here since it also contains a server-only
// fetch helper with no reason to enter the client bundle.
function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

export default function Profile() {
  const { user } = useAuth();
  const advisingCache = useAdvisingCache();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const [university, setUniversity] = useState<SelectedUniversity | null>(null);
  const [universityLoading, setUniversityLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [suggestions, setSuggestions] = useState<UniversitySuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [savingUniversity, setSavingUniversity] = useState(false);

  useEffect(() => {
    if (!user) return;
    getStudentProfile(user.uid)
      .then(setProfile)
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        const data = snap.data();
        if (data?.universityDomain) {
          setUniversity({ name: data.universityName ?? data.universityDomain, domain: data.universityDomain });
        }
      })
      .catch((error) => console.error("Failed to load university:", error))
      .finally(() => setUniversityLoading(false));
  }, [user]);

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
      setProfile({ summary: "", messageCount: 0 });
    } catch (error) {
      console.error("Error clearing learning profile:", error);
    } finally {
      setClearing(false);
      setConfirmingClear(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-main p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-text-main">Profile</h1>
        {user?.email && <p className="mt-1 text-sm text-text-muted">{user.email}</p>}

        <div className="mt-8 rounded-xl border border-border-light bg-bg-container p-6">
          <h2 className="text-lg font-semibold text-text-main">Your university</h2>
          <p className="mt-1 text-sm text-text-muted">
            Used to personalize Advising's course recommendations. We currently have detailed course-offering
            data for Louisiana Tech University only — other schools will show a "not supported yet" message on
            Advising until we add more.
          </p>

          <div className="relative mt-4">
            {universityLoading ? (
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Loader2 size={16} className="animate-spin" /> Loading...
              </div>
            ) : (
              <>
                {university && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg border border-border-light bg-bg-container p-3">
                    <img src={faviconUrl(university.domain)} alt="" className="h-6 w-6 rounded" />
                    <span className="text-sm text-text-main">{university.name}</span>
                  </div>
                )}
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  disabled={savingUniversity}
                  placeholder={university ? "Search to change your university..." : "Search for your university..."}
                  className="w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none disabled:opacity-60"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border-light bg-bg-container shadow-lg">
                    {suggestions.map((s) => (
                      <li key={`${s.name}-${s.domain}`}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectUniversity(s)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-bg-warm"
                        >
                          <img src={faviconUrl(s.domain)} alt="" className="h-4 w-4 rounded" />
                          <span className="text-text-main">{s.name}</span>
                          {s.country && <span className="text-xs text-text-muted">{s.country}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-border-light bg-bg-container p-6">
          <h2 className="text-lg font-semibold text-text-main">What Catalyst has learned about you</h2>
          <p className="mt-1 text-sm text-text-muted">
            Every so often, Catalyst updates a short, private summary of your academic goals and how you
            learn best, so it can tailor explanations without you having to repeat yourself. It only covers
            your studies — nothing personal. You can view or clear it here at any time.
          </p>

          <div className="mt-5">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Loader2 size={16} className="animate-spin" /> Loading...
              </div>
            ) : profile?.summary ? (
              <>
                <div className="rounded-lg border border-border-light bg-bg-container p-4 text-sm leading-relaxed text-text-main">
                  {profile.summary}
                </div>
                {profile.updatedAt && (
                  <p className="mt-2 text-xs text-text-muted">
                    Last updated {profile.updatedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </p>
                )}

                {confirmingClear ? (
                  <div className="mt-4 flex items-center gap-3 rounded-lg border border-alert-error-bg bg-alert-error-bg p-3">
                    <p className="flex-1 text-sm text-alert-error">
                      Clear everything Catalyst has learned about you? This can&apos;t be undone.
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
                Nothing yet — Catalyst builds this up gradually as you use the AI chat.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


