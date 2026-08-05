"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth } from "@/src/library/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { signInWithGoogle, signInWithApple } from "@/src/library/socialAuth";
import { useAuth } from "@/src/context/AuthContext";
import { touchRememberCookie } from "@/src/library/session";
import AppleLogo from "@/src/components/icons/AppleLogo";
import AppLogo from "@/src/components/AppLogo";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const greeting: string = "C a t a l y s t .";

  // Firebase Auth persists a signed-in session on this device indefinitely
  // by default — the middleware-facing fb_token cookie is what actually
  // expires (hourly), not the underlying session. So landing here with
  // Firebase already recognizing the device (e.g. redirected by middleware
  // over a stale cookie after the browser was closed a while) means the
  // user shouldn't have to re-enter credentials — bounce them straight
  // through instead of showing the form. This is also the ONLY place that
  // navigates after a fresh sign-in (the handlers below deliberately don't
  // call router.push themselves): AuthContext writes the fb_token cookie
  // inside its own onIdTokenChanged listener, asynchronously, after its own
  // await — a handler navigating immediately after signInWith... resolves
  // can easily race ahead of that write, hit middleware with no cookie yet,
  // and get bounced right back to /login with no way to retry (confirmed
  // live: `user` doesn't change again afterward, so a dep-array effect
  // never re-fires). Reacting to `user` here instead guarantees the cookie
  // already exists by the time this runs.
  useEffect(() => {
    if (!authLoading && user) {
      router.push(searchParams.get("redirect") || "/dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  async function handleLogin() {
    setIsSubmitting(true);
    try {
      // Must happen before the actual sign-in call, not after — Firebase
      // fires its internal auth-state listener (AuthContext's
      // onIdTokenChanged) as part of processing the credential, which can
      // run before this async function resumes past the await below.
      touchRememberCookie();
      await signInWithEmailAndPassword(auth, email, password);
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
      touchRememberCookie();
      await signInWithGoogle();
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
      touchRememberCookie();
      await signInWithApple();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Apple sign-in failed.");
      console.log(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Either still checking the persisted session, or already found one and
  // about to redirect — showing the form for a flash in either case would
  // defeat the point of the silent bounce-through above.
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
                      flex-col w-100 h-100 px-10 py-10 sm:px-16 lg:px-24">

        <AppLogo className="w-[168px] h-[168px]" />

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
            className="border border-border-light bg-bg-container text-text-main px-3 py-2 rounded mt-8 font-mono text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="password"
            className="border border-border-light bg-bg-container text-text-main px-3 py-2 rounded font-mono text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            onClick={handleLogin}
            disabled={isSubmitting}
            className="bg-primary text-text-inverse py-1 px-4 rounded
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
                      border-border-light bg-bg-container py-1.5 px-4 text-sm
                      text-text-main hover:bg-bg-warm disabled:opacity-50"
          >
            <img src="/google-logo.svg" alt="" className="h-4 w-4" />
            Continue with Google
          </button>

          <button
            type="button"
            onClick={handleAppleLogin}
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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
