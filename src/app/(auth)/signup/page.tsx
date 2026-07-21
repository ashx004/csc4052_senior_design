"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/src/library/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { signInWithGoogle, signInWithApple } from "@/src/library/socialAuth";

import {
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [college, setCollege] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const greeting: string = "C a t a l y s t .";


  async function handleSignup() {
    setIsSubmitting(true);
    try {
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

      router.push("/dashboard");

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
      await signInWithGoogle();
      router.push("/dashboard");
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
      await signInWithApple();
      router.push("/dashboard");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Apple sign-up failed.");
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
            className="border px-3 py-2 rounded mt-8 font-mono text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            type="email"
            placeholder="email"
            className="border px-3 py-2 rounded mt-2 font-mono text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="password"
            className="border px-3 py-2 rounded mt-2 font-mono text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <input
            type="role"
            placeholder="role"
            className="border px-3 py-2 rounded mt-2 font-mono text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />

          <input
            type="text"
            placeholder="college / university (optional)"
            className="border px-3 py-2 rounded mt-2 font-mono text-sm"
            value={college}
            onChange={(e) => setCollege(e.target.value)}
          />

          <button
            onClick={handleSignup}
            disabled={isSubmitting}
            className="bg-primary text-white py-1 px-4 rounded
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
                      border-border-light bg-white py-1.5 px-4 text-sm
                      text-text-main hover:bg-bg-warm disabled:opacity-50"
          >
            <img src="/google-logo.webp" alt="" className="h-4 w-4" />
            Continue with Google
          </button>

          <button
            type="button"
            onClick={handleAppleSignup}
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
