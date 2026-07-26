"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { getStudentProfile, clearStudentProfile, StudentProfile } from "@/src/library/studentProfile";

export default function Profile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    if (!user) return;
    getStudentProfile(user.uid)
      .then(setProfile)
      .finally(() => setLoading(false));
  }, [user]);

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
                <div className="rounded-lg border border-border-light bg-white p-4 text-sm leading-relaxed text-text-main">
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
