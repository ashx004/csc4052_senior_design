"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import RecoveryScreen from "@/src/components/recovery/RecoveryScreen";

/** Displays for unmatched application URLs. */
export default function NotFound() {
  const router = useRouter();
  const pathname = usePathname();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    // Only expose Back when the preceding document is also Catalyst. This
    // avoids returning a user to an unrelated site while retaining normal
    // browser history for an in-app navigation to a missing URL.
    try {
      const referrer = document.referrer ? new URL(document.referrer) : null;
      setCanGoBack(Boolean(referrer && referrer.origin === window.location.origin && window.history.length > 1));
    } catch {
      setCanGoBack(false);
    }
  }, [pathname]);

  return (
    <RecoveryScreen
      variant="not-found"
      layout="page"
      primaryAction={{
        label: canGoBack ? "Go back" : "Go to dashboard",
        onClick: () => (canGoBack ? router.back() : router.push("/dashboard")),
      }}
      secondaryAction={canGoBack ? { label: "Go to dashboard", onClick: () => router.push("/dashboard") } : undefined}
    />
  );
}
