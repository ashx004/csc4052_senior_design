"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth } from "@/src/library/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { signInWithGoogle, signInWithApple } from "@/src/library/socialAuth";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const greeting: string = "C a t a l y s t .";

  function goToDestination() {
    router.push(searchParams.get("redirect") || "/dashboard");
  }

  async function handleLogin() {
    setIsSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      goToDestination();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Login failed.");
      console.log(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
      goToDestination();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Google sign-in failed.");
      console.log(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAppleLogin() {
    setIsSubmitting(true);
    try {
      await signInWithApple();
      goToDestination();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Apple sign-in failed.");
      console.log(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center
                    bg-bg-main">
      <div className="bg-white rounded items-center shadow-md flex
                      flex-col w-100 h-100 p-6">

        <img
          src="/app-logo.webp"
          alt="catalyst logo"
          className="w-42 h-42"
        />

        <h1 className="text-3xl font-extrabold text-text-main font-sans">
          {greeting}
        </h1>

        <p className="text-text-main font-mono font-thin text-xs">
          More than just notes !
        </p>

        <div className="flex flex-col gap-4 w-full mt-8">
          <input
            type="email"
            placeholder="email"
            className="border px-3 py-2 rounded mt-8 font-mono text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="password"
            className="border px-3 py-2 rounded font-mono text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            onClick={handleLogin}
            disabled={isSubmitting}
            className="bg-primary text-white py-1 px-4 rounded
                      hover:bg-primary-hover disabled:opacity-50" >
            Log In
          </button>

          <div className="flex items-center gap-2 text-xs text-text-muted">
            <div className="h-px flex-1 bg-border-light" />
            or
            <div className="h-px flex-1 bg-border-light" />
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isSubmitting}
            className="flex items-center justify-center gap-2 rounded border
                      border-border-light bg-white py-1.5 px-4 text-sm
                      text-text-main hover:bg-bg-warm disabled:opacity-50"
          >
            <img src="/google-logo.webp" alt="" className="h-4 w-4" />
            Continue with Google
          </button>

          <button
            type="button"
            onClick={handleAppleLogin}
            disabled={isSubmitting}
            className="flex items-center justify-center gap-2 rounded border
                      border-border-light bg-white py-1.5 px-4 text-sm
                      text-text-main hover:bg-bg-warm disabled:opacity-50"
          >
            <img src="/apple-logo.webp" alt="" className="h-4 w-4" />
            Continue with Apple
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
