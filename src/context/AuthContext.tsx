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
        document.cookie = `${SESSION_COOKIE}=${token}; path=/; max-age=3600; SameSite=Lax`;
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
