"use client";

import RecoveryScreen from "./RecoveryScreen";

/** Route-aware recovery actions for a course that no longer exists. */
export default function CourseUnavailableRecovery({
  onBackToClasses,
  onDashboard,
}: {
  onBackToClasses: () => void;
  onDashboard: () => void;
}) {
  return (
    <RecoveryScreen
      variant="unavailable"
      layout="page"
      primaryAction={{ label: "Back to classes", onClick: onBackToClasses }}
      secondaryAction={{ label: "Go to dashboard", onClick: onDashboard }}
    />
  );
}
