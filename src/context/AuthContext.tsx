"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { setAnalyticsUser } from "@/src/library/analytics";
import { auth } from "@/src/library/firebase";
import { onIdTokenChanged, User, signOut } from "firebase/auth";
import {
  clearRememberCookie,
  hasRememberCookie,
  touchRememberCookie,
} from "@/src/library/session";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  logout: async () => {},
});

const SESSION_COOKIE = "fb_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // onIdTokenChanged (not onAuthStateChanged) so the cookie also refreshes
    // when Firebase silently rotates the token — middleware reads this
    // cookie to decide whether a page request is authenticated.
    let latestAuthUpdate = 0;
    const unsubscribe = onIdTokenChanged(auth, async (currentUser) => {
      const authUpdate = ++latestAuthUpdate;
      setAnalyticsUser(currentUser?.uid ?? null);
      // Cookie is written BEFORE user/loading state updates, not after —
      // otherwise a consumer reacting to `user` becoming truthy (e.g. the
      // login page's already-signed-in redirect) can navigate to a
      // middleware-gated route a moment before the fresh cookie actually
      // exists, bouncing straight back to /login on a stale/missing cookie.
      setIsAdmin(false);
      if (currentUser) {
        // The 30-day remember window is set at interactive sign-in
        // (login/signup pages, before this listener even fires — see
        // touchRememberCookie there) and slides forward here on every
        // subsequent visit within it. If it's missing at this point, either
        // 30 days have passed since the last visit, or this is a session
        // Firebase restored from before this cap existed — either way,
        // don't silently keep it alive forever; require a real sign-in to
        // start a fresh window.
        if (!hasRememberCookie()) {
          setAnalyticsUser(null);
          await signOut(auth);
          if (authUpdate !== latestAuthUpdate) return;
          document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
          setUser(null);
          setLoading(false);
          return;
        }
        touchRememberCookie();

        const token = await currentUser.getIdToken();
        // This claim controls navigation; the server separately enforces access.
        const tokenResult = await currentUser.getIdTokenResult();
        if (authUpdate !== latestAuthUpdate) return;
        setIsAdmin(tokenResult.claims.admin === true);
        // Secure on HTTPS so the token never travels in clear text; plain-http
        // LAN/dev access keeps working because the flag is only added there.
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `${SESSION_COOKIE}=${token}; path=/; max-age=3600; SameSite=Lax${secure}`;
        reportThisDevice();
      } else {
        document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
        clearRememberCookie();
      }

      setUser(currentUser);
      setLoading(false);
    });
    return () => {
      latestAuthUpdate += 1;
      unsubscribe();
      setAnalyticsUser(null);
    };
  }, []);

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

// Settings > Sign-in devices lists every browser the account uses, with when
// it was last active. Reported at most every 30 minutes per tab session; the
// server keeps it to one write per 10 minutes. Failures don't matter.
const DEVICE_REPORT_KEY = "catalyst:deviceReportedAt";
let deviceReportInFlight = false;
function reportThisDevice() {
  try {
    if (Date.now() - Number(sessionStorage.getItem(DEVICE_REPORT_KEY) ?? 0) < 30 * 60_000) return;
  } catch {
    // No session storage (private mode): still report, the server throttles.
  }
  if (deviceReportInFlight) return;
  deviceReportInFlight = true;
  // keepalive: signing in navigates away at once, which cancelled the report
  // before its device cookie arrived, so every new tab recorded a new device.
  // The throttle is only set once the report has gone through.
  fetch("/api/auth/devices", { method: "POST", keepalive: true })
    .then((res) => {
      if (!res.ok) return;
      try {
        sessionStorage.setItem(DEVICE_REPORT_KEY, String(Date.now()));
      } catch {
        // see above
      }
    })
    .catch(() => undefined)
    .finally(() => {
      deviceReportInFlight = false;
    });
}
