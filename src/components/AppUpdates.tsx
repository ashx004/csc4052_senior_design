"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { compareVersions, type AppVersionInfo } from "@/src/library/appVersion";

// The commit this page was built from (set by CI; absent in development).
const BUILD = process.env.NEXT_PUBLIC_BUILD_ID;
const INSTALLED_KEY = "catalyst.androidAppVersion";
const IN_APP_KEY = "catalyst.inAndroidApp";
const DISMISSED_KEY = "catalyst.dismissedAndroidUpdate";
const CHECK_EVERY_MS = 10 * 60 * 1000;

function read(store: () => Storage, key: string): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}

function write(store: () => Storage, key: string, value: string) {
  try {
    store().setItem(key, value);
  } catch {
    // Storage blocked (private mode etc.): the notices just won't remember.
  }
}

const local = () => window.localStorage;
const session = () => window.sessionStorage;

/** Registers the service worker and offers two kinds of update:
 *  - a newer deploy of the site than this tab is running ("Refresh"), and
 *  - inside the Android app, a newer APK on GitHub Releases ("Download"). */
export default function AppUpdates() {
  const [newBuild, setNewBuild] = useState(false);
  const [apk, setApk] = useState<{ version: string; url: string } | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("Service worker registration failed:", error));
    }

    // The Android app opens /?app=android&v=1.2.0, so we know it's the app and which version.
    const params = new URLSearchParams(window.location.search);
    const launchedVersion = params.get("app") === "android" ? params.get("v") : null;
    if (launchedVersion) {
      write(local, INSTALLED_KEY, launchedVersion);
      write(session, IN_APP_KEY, "1");
    }

    let lastCheck = 0;
    const check = async () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck < CHECK_EVERY_MS) return;
      lastCheck = Date.now();
      try {
        const response = await fetch("/api/app-version", { cache: "no-store" });
        if (!response.ok) return;
        const info = (await response.json()) as AppVersionInfo;
        if (BUILD && info.build && info.build !== BUILD) setNewBuild(true);
        const installed = read(local, INSTALLED_KEY);
        const inApp = read(session, IN_APP_KEY) === "1";
        if (inApp && installed && info.android && compareVersions(info.android.version, installed) > 0 && read(local, DISMISSED_KEY) !== info.android.version) {
          setApk(info.android);
        }
      } catch {
        // Offline or the check failed; try again next time the page is shown.
      }
    };
    void check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);

  if (!newBuild && !apk) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:inset-x-auto sm:bottom-6 sm:left-6 sm:max-w-sm">
      {apk && (
        <div role="status" className="flex items-start gap-3 rounded-xl bg-navy px-4 py-3 text-sm text-white shadow-lg">
          <div className="flex-1">
            <p className="font-semibold">App update available</p>
            <p className="mt-0.5 text-white/70">Version {apk.version} of the Catalyst app is ready to install.</p>
            <a href={apk.url} className="mt-2 inline-block rounded-md bg-white/15 px-3 py-1 text-xs font-medium hover:bg-white/25">
              Download
            </a>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              write(local, DISMISSED_KEY, apk.version);
              setApk(null);
            }}
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-white/70 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {newBuild && (
        <div role="status" className="flex items-start gap-3 rounded-xl bg-navy px-4 py-3 text-sm text-white shadow-lg">
          <div className="flex-1">
            <p className="font-semibold">Catalyst was updated</p>
            <p className="mt-0.5 text-white/70">Refresh to get the latest version.</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-2 rounded-md bg-white/15 px-3 py-1 text-xs font-medium hover:bg-white/25">
              Refresh
            </button>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setNewBuild(false)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-white/70 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
