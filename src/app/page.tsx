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
  const greeting: string = "C a t a l y s t .";

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
    <div className="flex min-h-screen justify-center bg-bg-main">
      <div className="text-center">

        <AppLogo className="w-[340px] h-[340px]" />

        <h1 className="text-4xl font-bold text-text-main font-sans">
          {greeting}
        </h1>

        <p className="text-text-main font-mono font-thin text-sm mt-6">
          More than just notes !
        </p>

        <div className="mt-20 flex flex-col items-center">
          <Link href="/login">
            <button className="bg-transparent font-thin text-sm underline
            text-text-main font-sans cursor-pointer px-16 py-2 rounded
            hover:bg-bg-warm active:bg-border-light">
              Log-In
            </button>
          </Link>

          <Link href="/signup">
            <button className="mt-2 bg-transparent font-thin text-sm underline
            text-text-main font-sans cursor-pointer px-4 py-2 rounded
            hover:bg-bg-warm active:bg-border-light">
              Create a new account
            </button>
          </Link>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
            className="mt-24 bg-bg-container font-thin text-sm
          text-text-main font-sans cursor-pointer px-10 py-2 rounded
          hover:bg-bg-warm active:bg-border-light flex items-center
          gap-2 disabled:opacity-50">
            <span> Sign in with Google </span>
            <img
              src="/google-logo.svg"
              alt="Google Icon"
              className="w-6 h-6"
            />
          </button>

          <button
            type="button"
            onClick={handleAppleSignIn}
            disabled={isSubmitting}
            className="mt-5 bg-bg-container font-thin text-sm
          text-text-main font-sans cursor-pointer px-12 py-3 rounded
          hover:bg-bg-warm active:bg-border-light flex items-center
          gap-2 disabled:opacity-50">
            <span> Sign in with Apple </span>
            <AppleLogo className="w-5 h-5 text-text-main" />
          </button>
        </div>
      </div>
    </div>
  );
}
