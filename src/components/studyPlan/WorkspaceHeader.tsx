"use client";

import { Bell, ChevronDown } from "lucide-react";

interface WorkspaceHeaderProps {
  userName: string;
  userInitial: string;
  onNotifications?: () => void;
  onProfile?: () => void;
}

export default function WorkspaceHeader({
  userName,
  userInitial,
  onNotifications,
  onProfile,
}: WorkspaceHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brown-label">
          Learning workspace · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-navy sm:text-3xl">
          Your learning, with a plan.
        </h1>
        <p className="mt-1 text-sm text-gray-secondary">
          Choose a class to explore, or let your plan guide the next step.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onNotifications}
          aria-label="Notifications"
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white text-gray-secondary transition-colors hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          <Bell size={18} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onProfile}
          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-3 transition-colors hover:bg-beige-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-brown-label text-xs font-semibold text-white"
          >
            {userInitial}
          </span>
          <span className="text-sm font-medium text-navy">{userName}</span>
          <ChevronDown size={14} className="text-gray-secondary" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
