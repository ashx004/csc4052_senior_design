"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/src/library/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { signInWithGoogle, signInWithApple } from "@/src/library/socialAuth";
import { useAuth } from "@/src/context/AuthContext";
import { touchRememberCookie } from "@/src/library/session";
import AppleLogo from "@/src/components/icons/AppleLogo";
import AppLogo from "@/src/components/AppLogo";

import {
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

export default function Signup() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [college, setCollege] = useState("");
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

  async function handleSignup() {
    setIsSubmitting(true);
    try {
      touchRememberCookie();
      // create authentication account
      const userCredntial =
        await createUserWithEmailAndPassword(auth, email, password);

      // get firebase user's UID
      const user = userCredntial.user;

      // create the user's firestore document
      await setDoc(doc(db, "users", user.uid), {
        name: name,
        email: email,
        role: role,
        college: college,
        joinedAt: serverTimestamp(),
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Account failed to be created.");
      console.log(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignup() {
    setIsSubmitting(true);
    try {
      touchRememberCookie();
      await signInWithGoogle();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Google sign-up failed.");
      console.log(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAppleSignup() {
    setIsSubmitting(true);
    try {
      touchRememberCookie();
      await signInWithApple();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Apple sign-up failed.");
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
    <div className="flex min-h-screen items-center justify-center
                    bg-bg-main">
      <div className="bg-bg-container rounded items-center shadow-md flex
                      flex-col w-100 h-100 p-6">

        <AppLogo className="w-[168px] h-[168px]" />

        <h1 className="text-3xl font-bold text-text-main font-sans">
          {greeting}
        </h1>

        <p className="text-text-main font-mono font-thin text-xs">
          More than just notes !
        </p>

        <div className="flex flex-col gap-4 w-full mt-8">

          <input
            type="name"
            placeholder="name"
            className="border border-border-light bg-bg-container text-text-main px-3 py-2 rounded mt-8 font-mono text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            type="email"
            placeholder="email"
            className="border border-border-light bg-bg-container text-text-main px-3 py-2 rounded mt-2 font-mono text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="password"
            className="border border-border-light bg-bg-container text-text-main px-3 py-2 rounded mt-2 font-mono text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <input
            type="role"
            placeholder="role"
            className="border border-border-light bg-bg-container text-text-main px-3 py-2 rounded mt-2 font-mono text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />

          <input
            type="text"
            placeholder="college / university (optional)"
            className="border border-border-light bg-bg-container text-text-main px-3 py-2 rounded mt-2 font-mono text-sm"
            value={college}
            onChange={(e) => setCollege(e.target.value)}
          />

          <button
            onClick={handleSignup}
            disabled={isSubmitting}
            className="bg-primary text-text-inverse py-1 px-4 rounded
                      hover:bg-primary-hover disabled:opacity-50" >
            Sign In
          </button>

          <div className="flex items-center gap-2 text-xs text-text-muted">
            <div className="h-px flex-1 bg-border-light" />
            or
            <div className="h-px flex-1 bg-border-light" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignup}
            disabled={isSubmitting}
            className="flex items-center justify-center gap-2 rounded border
                      border-border-light bg-bg-container py-1.5 px-4 text-sm
                      text-text-main hover:bg-bg-warm disabled:opacity-50"
          >
            <img src="/google-logo.svg" alt="" className="h-4 w-4" />
            Continue with Google
          </button>

          <button
            type="button"
            onClick={handleAppleSignup}
            disabled={isSubmitting}
            className="flex items-center justify-center gap-2 rounded border
                      border-border-light bg-bg-container py-1.5 px-4 text-sm
                      text-text-main hover:bg-bg-warm disabled:opacity-50"
          >
            <AppleLogo className="h-4 w-4 text-text-main" />
            Continue with Apple
          </button>
        </div>
      </div>
    </div>

  );
}
