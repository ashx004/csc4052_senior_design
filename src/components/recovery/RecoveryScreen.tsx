"use client";

import type { ComponentType, ReactNode } from "react";
import {
  AlertTriangle,
  FileQuestion,
  RefreshCw,
  ServerCrash,
  WifiOff,
} from "lucide-react";

/**
 * The user-facing failure states that Catalyst can recover from. Keeping this
 * finite makes route- and request-level error copy consistent without leaking
 * implementation details from the error that caused it.
 */
export type RecoveryVariant =
  | "not-found"
  | "unavailable"
  | "network"
  | "server"
  | "unexpected";

export interface RecoveryAction {
  /** Label shown to the user. */
  label: string;
  /** Use for client-side navigation supplied by the calling route/page. */
  href?: string;
  /** Use for retry and other in-place recovery actions. */
  onClick?: () => void;
  /** Disables the action, such as while a retry request is in progress. */
  disabled?: boolean;
}

export interface RecoveryScreenProps {
  /** Chooses the default title, message, and icon. */
  variant?: RecoveryVariant;
  /** Overrides the title for route- or page-specific context. */
  title?: string;
  /** Overrides the explanatory text for route- or page-specific context. */
  message?: string;
  /** The primary recovery action, typically Retry. */
  primaryAction?: RecoveryAction;
  /** An optional secondary navigation action, such as Back or Home. */
  secondaryAction?: RecoveryAction;
  /** Shows progress feedback and prevents duplicate primary submissions. */
  isRetrying?: boolean;
  /** Use `page` for a route fallback and `content` inside an existing page shell. */
  layout?: "page" | "content";
  /** Optional content for a route/page to add non-sensitive context. */
  children?: ReactNode;
  className?: string;
}

interface RecoveryPresentation {
  title: string;
  message: string;
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

const presentations: Record<RecoveryVariant, RecoveryPresentation> = {
  "not-found": {
    title: "We couldn't find that page",
    message: "The page may have moved, or the address may not be correct.",
    Icon: FileQuestion,
  },
  unavailable: {
    title: "This page isn't available",
    message: "It may have been removed or is no longer available to you.",
    Icon: FileQuestion,
  },
  network: {
    title: "We're having trouble connecting",
    message: "Check your connection and try again.",
    Icon: WifiOff,
  },
  server: {
    title: "Catalyst couldn't complete that request",
    message: "Please try again in a moment.",
    Icon: ServerCrash,
  },
  unexpected: {
    title: "Something went wrong",
    message: "We couldn't load this right now. Please try again.",
    Icon: AlertTriangle,
  },
};

function RecoveryActionButton({
  action,
  kind,
  isRetrying = false,
}: {
  action: RecoveryAction;
  kind: "primary" | "secondary";
  isRetrying?: boolean;
}) {
  const isPrimary = kind === "primary";
  const isDisabled = Boolean(action.disabled || (isPrimary && isRetrying));
  const label = isPrimary && isRetrying ? "Trying again…" : action.label;
  const sharedClasses =
    "inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60";
  const classes = isPrimary
    ? `${sharedClasses} gap-2 bg-primary text-text-inverse hover:bg-primary-hover`
    : `${sharedClasses} border border-border-light bg-bg-container text-text-main hover:bg-bg-warm`;

  if (action.href && !isDisabled) {
    return (
      <a className={classes} href={action.href}>
        {isPrimary && <RefreshCw aria-hidden className="h-4 w-4" />}
        {label}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      onClick={action.onClick}
      disabled={isDisabled}
      aria-busy={isPrimary && isRetrying ? true : undefined}
    >
      {isPrimary && <RefreshCw aria-hidden className={isRetrying ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
      {label}
    </button>
  );
}

/**
 * Theme-aware recovery UI for page, route, and request failures.
 *
 * Navigation is deliberately supplied by the caller, so a route can use its
 * client-side navigation mechanism while an embedded page can retain its shell
 * and surrounding context.
 */
export default function RecoveryScreen({
  variant = "unexpected",
  title,
  message,
  primaryAction,
  secondaryAction,
  isRetrying = false,
  layout = "content",
  children,
  className = "",
}: RecoveryScreenProps) {
  const presentation = presentations[variant];
  const Icon = presentation.Icon;
  const resolvedTitle = title ?? presentation.title;
  const resolvedMessage = message ?? presentation.message;
  const layoutClasses =
    layout === "page"
      ? "min-h-[calc(100vh-var(--topbar-h))] px-4 py-10 sm:px-6"
      : "w-full px-4 py-8 sm:px-6";

  return (
    <section
      className={`${layoutClasses} flex items-center justify-center ${className}`.trim()}
      aria-labelledby="recovery-screen-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-border-light bg-bg-container p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-alert-error-bg text-alert-error">
          <Icon aria-hidden className="h-6 w-6" />
        </div>

        <div className="mt-5" role="alert" aria-live="assertive">
          <h1 id="recovery-screen-title" className="text-xl font-semibold text-text-main sm:text-2xl">
            {resolvedTitle}
          </h1>
          <p className="mt-2 text-sm leading-6 text-text-muted">{resolvedMessage}</p>
        </div>

        {children ? <div className="mt-4 text-sm text-text-muted">{children}</div> : null}

        {primaryAction || secondaryAction ? (
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            {primaryAction ? (
              <RecoveryActionButton action={primaryAction} kind="primary" isRetrying={isRetrying} />
            ) : null}
            {secondaryAction ? <RecoveryActionButton action={secondaryAction} kind="secondary" /> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
