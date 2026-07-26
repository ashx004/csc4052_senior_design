"use client";

import { useEffect, useRef } from "react";
import { Calendar } from "lucide-react";

interface GoogleCalendarConnectProps {
  onConnected?: () => void;
}

export default function GoogleCalendarConnect({ onConnected }: GoogleCalendarConnectProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => initGisClient();
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  function initGisClient() {
    // @ts-expect-error — google.accounts is loaded dynamically
    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID!,
      scope: "https://www.googleapis.com/auth/calendar.events.readonly",
      ux_mode: "popup",
      access_type: "offline",
      callback: async (response: { code?: string }) => {
        if (!response.code) return;
        await fetch("/api/calendar/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: response.code }),
        });
        onConnected?.();
      },
    });

    buttonRef.current?.addEventListener("click", () => client.requestCode());
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-light bg-bg-container p-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-bg-warm">
        <Calendar size={26} className="text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-text-main">
        Connect your Google Calendar
      </h3>
      <p className="mt-2 max-w-sm text-sm text-text-muted">
        Link your Google Calendar to see your events alongside your schedule — all in one place.
      </p>
      <button
        ref={buttonRef}
        type="button"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-hover"
      >
        Connect Calendar
      </button>
    </div>
  );
}
