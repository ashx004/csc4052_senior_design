"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth } from "@/src/library/firebase";
import { signInWithCustomToken } from "firebase/auth";
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
  const [loginError, setLoginError] = useState("");
  const [awaitingTwoFactor, setAwaitingTwoFactor] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorMessage, setTwoFactorMessage] = useState("");
  const [isResendingCode, setIsResendingCode] = useState(false);
  const [resendAfterSeconds, setResendAfterSeconds] = useState(0);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const greeting: string = "C a t a l y s t .";
  const actionMessage = searchParams.get("emailVerified") === "1"
    ? "Your email has been verified. You can now sign in."
    : searchParams.get("passwordReset") === "1"
      ? "Your password has been reset. Sign in with your new password."
      : "";

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

  useEffect(() => {
    if (resendAfterSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendAfterSeconds((seconds) => Math.max(0, seconds - 1)), 1_000);
    return () => window.clearTimeout(timer);
  }, [resendAfterSeconds]);

  async function handleLogin() {
    setIsSubmitting(true);
    setLoginError("");
    try {
      // Must happen before the actual sign-in call, not after — Firebase
      // fires its internal auth-state listener (AuthContext's
      // onIdTokenChanged) as part of processing the credential, which can
      // run before this async function resumes past the await below.
      const response = await fetch("/api/auth/login-2fa/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Unable to start sign-in verification.");
      setAwaitingTwoFactor(true);
      setPassword("");
      setTwoFactorCode("");
      setTwoFactorMessage(data?.message || "A sign-in code was sent to your email address.");
      setResendAfterSeconds(typeof data?.resendAfterSeconds === "number" ? data.resendAfterSeconds : 60);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTwoFactorVerification() {
    setIsSubmitting(true);
    setTwoFactorMessage("");
    try {
      const response = await fetch("/api/auth/login-2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: twoFactorCode }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Unable to verify the sign-in code.");
      if (typeof data?.customToken !== "string") throw new Error("Unable to complete sign-in.");

      touchRememberCookie();
      await signInWithCustomToken(auth, data.customToken);
    } catch (error) {
      setTwoFactorMessage(error instanceof Error ? error.message : "Unable to verify the sign-in code.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendTwoFactorCode() {
    setIsResendingCode(true);
    setTwoFactorMessage("");
    try {
      const response = await fetch("/api/auth/login-2fa/resend", { method: "POST" });
      const data = await response.json().catch(() => null);
      const retryAfter = typeof data?.resendAfterSeconds === "number" ? data.resendAfterSeconds : 0;
      if (retryAfter) setResendAfterSeconds(retryAfter);
      if (!response.ok) throw new Error(data?.error || "Unable to send another code.");
      setTwoFactorMessage(data?.message || "A new sign-in code was sent.");
      setResendAfterSeconds(retryAfter || 60);
    } catch (error) {
      setTwoFactorMessage(error instanceof Error ? error.message : "Unable to send another code.");
    } finally {
      setIsResendingCode(false);
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

  async function handlePasswordReset() {
    const cleanedEmail = email.trim().toLowerCase();
    if (!cleanedEmail) {
      setResetMessage("Enter your email address first.");
      return;
    }

    setIsResetSubmitting(true);
    setResetMessage("");
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanedEmail }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Unable to request a password reset.");
      setResetMessage(data?.message || "If an account exists for that email address, a reset link has been sent.");
    } catch (error) {
      setResetMessage(error instanceof Error ? error.message : "Unable to request a password reset.");
    } finally {
      setIsResetSubmitting(false);
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

  if (awaitingTwoFactor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-main">
        <div className="flex w-full max-w-md flex-col items-center rounded bg-bg-container px-10 py-10 shadow-md sm:px-16">
          <AppLogo className="h-[168px] w-[168px]" />
          <h1 className="font-sans text-3xl font-extrabold text-text-main">Confirm it&apos;s you</h1>
          <p className="mt-2 text-center text-sm text-text-muted">
            Enter the eight-digit code sent to {email.trim() || "your email address"}.
          </p>
          <div className="mt-8 flex w-full flex-col gap-4">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              placeholder="12345678"
              value={twoFactorCode}
              onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, ""))}
              className="rounded border border-border-light bg-bg-container px-3 py-2 text-center font-mono text-lg tracking-[0.35em] text-text-main outline-none focus:border-primary"
              aria-label="Eight-digit sign-in code"
            />
            <button
              type="button"
              onClick={handleTwoFactorVerification}
              disabled={isSubmitting || twoFactorCode.length !== 8}
              className="rounded bg-primary px-4 py-2 text-text-inverse hover:bg-primary-hover disabled:opacity-50"
            >
              {isSubmitting ? "Verifying..." : "Verify and sign in"}
            </button>
            <button
              type="button"
              onClick={handleResendTwoFactorCode}
              disabled={isResendingCode || resendAfterSeconds > 0}
              className="text-sm font-medium text-primary hover:text-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isResendingCode
                ? "Sending..."
                : resendAfterSeconds > 0
                  ? `Resend code in ${resendAfterSeconds}s`
                  : "Resend code"}
            </button>
            <button
              type="button"
              onClick={() => { setAwaitingTwoFactor(false); setTwoFactorCode(""); setTwoFactorMessage(""); }}
              disabled={isSubmitting}
              className="text-sm text-text-muted hover:text-text-main"
            >
              Use a different account
            </button>
            {twoFactorMessage && <p role="status" className="rounded bg-bg-main px-3 py-2 text-center text-sm text-text-muted">{twoFactorMessage}</p>}
          </div>
        </div>
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
          {actionMessage && (
            <p role="status" className="rounded bg-alert-success-bg px-3 py-2 text-sm text-alert-success">
              {actionMessage}
            </p>
          )}
          {loginError && (
            <p role="alert" className="rounded bg-alert-error-bg px-3 py-2 text-sm text-alert-error">
              {loginError}
            </p>
          )}
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

          <button
            type="button"
            onClick={() => {
              setShowPasswordReset((visible) => !visible);
              setResetMessage("");
            }}
            className="self-start text-sm font-medium text-primary hover:text-primary-hover"
          >
            Forgot password?
          </button>

          {showPasswordReset && (
            <div className="rounded border border-border-light bg-bg-main p-3 text-sm text-text-main">
              <p className="mb-2 text-text-muted">We&apos;ll send a reset link if an account exists for this email.</p>
              <button
                type="button"
                onClick={handlePasswordReset}
                disabled={isResetSubmitting}
                className="rounded bg-primary px-3 py-1.5 font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-50"
              >
                {isResetSubmitting ? "Sending..." : "Send reset link"}
              </button>
              {resetMessage && <p role="status" className="mt-2 text-text-muted">{resetMessage}</p>}
            </div>
          )}

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
