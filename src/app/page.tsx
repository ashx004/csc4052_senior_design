"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithGoogle, signInWithApple } from "@/src/library/socialAuth";

export default function Home() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const greeting: string = "C a t a l y s t .";

  async function handleGoogleSignIn() {
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
      router.push("/dashboard");
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
      await signInWithApple();
      router.push("/dashboard");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Apple sign-in failed.");
      console.log(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen justify-center bg-bg-main">
      <div className="text-center">

        <img
          src="/app-logo.webp"
          alt="catalyst logo"
          className="w-85 h-85"
        />

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
            className="mt-24 bg-white font-thin text-sm
          text-text-main font-sans cursor-pointer px-10 py-2 rounded
          hover:bg-bg-warm active:bg-border-light flex items-center
          gap-2 disabled:opacity-50">
            <span> Sign in with Google </span>
            <img
              src="/google-logo.webp"
              alt="Google Icon"
              className="w-6 h-6"
            />
          </button>

          <button
            type="button"
            onClick={handleAppleSignIn}
            disabled={isSubmitting}
            className="mt-5 bg-white font-thin text-sm
          text-text-main font-sans cursor-pointer px-12 py-3 rounded
          hover:bg-bg-warm active:bg-border-light flex items-center
          gap-2 disabled:opacity-50">
            <span> Sign in with Apple </span>
            <img
              src="/apple-logo.webp"
              alt="Apple Icon"
              className="w-5 h-5"
            />
          </button>
        </div>
      </div>
    </div>
  );
}
