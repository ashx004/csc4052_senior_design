"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithGoogle, signInWithApple } from "@/src/library/socialAuth";
import { useAuth } from "@/src/context/AuthContext";
import { touchRememberCookie } from "@/src/library/session";
import AppleLogo from "@/src/components/icons/AppleLogo";
import AppLogo from "@/src/components/AppLogo";

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Same already-signed-in bounce-through as the login page — see its
  // comment for why this is the ONLY place that navigates after a fresh
  // sign-in (the handlers below deliberately don't call router.push
  // themselves — doing so raced ahead of AuthContext's cookie write and got
  // stuck bounced back on this page with no way to retry).
  useEffect(() => {
    if (!authLoading && user) {
      router.push("/dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  async function handleGoogleSignIn() {
    setIsSubmitting(true);
    try {
      touchRememberCookie();
      await signInWithGoogle();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Google sign-in failed.");
      console.log(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAppleSignIn() {
    setIsSubmitting(true);
    try {
      touchRememberCookie();
      await signInWithApple();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Apple sign-in failed.");
      console.log(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (authLoading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-main">
        <AppLogo className="w-32 h-32 animate-pulse" />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg-main px-6 py-12">
      <div className="fade-up flex w-full max-w-md flex-col items-center text-center">
        <AppLogo className="h-24 w-24" />

        <h1 className="mt-6 text-3xl font-bold tracking-[0.2em] text-text-main font-sans">CATALYST</h1>
        <p className="mt-3 text-base text-text-muted">More than just notes. Organize your classes, study smarter, and stay on top of every deadline.</p>

        <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="flex-1 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-text-inverse shadow-sm transition hover:bg-primary-hover"
          >
            Create an account
          </Link>
          <Link
            href="/login"
            className="flex-1 rounded-lg border border-border-hover bg-bg-container px-6 py-3 text-sm font-semibold text-text-main transition hover:bg-bg-warm"
          >
            Log in
          </Link>
        </div>

        <div className="my-6 flex w-full items-center gap-3 text-xs uppercase tracking-wide text-text-muted" aria-hidden>
          <span className="h-px flex-1 bg-border-light" />
          or continue with
          <span className="h-px flex-1 bg-border-light" />
        </div>

        <div className="flex w-full flex-col gap-3">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-border-light bg-bg-container px-6 py-3 text-sm font-medium text-text-main transition hover:bg-bg-warm disabled:opacity-50"
          >
            <img src="/google-logo.svg" alt="" className="h-5 w-5" />
            Continue with Google
          </button>

          <button
            type="button"
            onClick={handleAppleSignIn}
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-border-light bg-bg-container px-6 py-3 text-sm font-medium text-text-main transition hover:bg-bg-warm disabled:opacity-50"
          >
            <AppleLogo className="h-5 w-5 text-text-main" />
            Continue with Apple
          </button>
        </div>
      </div>
    </main>
  );
}
