"use client";

import { Bell, ChevronDown } from "lucide-react";
import type { StudyNotification } from "@/src/library/studyPlan/types";

interface WorkspaceHeaderProps {
  userName: string;
  userInitial: string;
  onNotifications?: () => void;
  notificationsOpen?: boolean;
  notifications?: (StudyNotification & { id: string })[];
  unreadCount?: number;
  onMarkNotificationRead?: (id: string) => void;
  onDismissNotification?: (id: string) => void;
  onProfile?: () => void;
}

export default function WorkspaceHeader({
  userName,
  userInitial,
  onNotifications,
  notificationsOpen = false,
  notifications = [],
  unreadCount = 0,
  onMarkNotificationRead,
  onDismissNotification,
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
        <div className="relative">
          <button
            type="button"
            onClick={onNotifications}
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
            className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white text-gray-secondary transition-colors hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            <Bell size={18} aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-brown-label px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {notificationsOpen && (
            <div className="absolute right-0 top-12 z-40 w-[min(24rem,calc(100vw-2rem))] rounded-2xl bg-white p-3 shadow-[0_18px_50px_rgba(26,26,48,.14)] ring-1 ring-navy/5">
              <div className="flex items-center justify-between px-2 pb-2">
                <h2 className="text-sm font-bold text-navy">Notifications</h2>
                <span className="text-xs text-gray-secondary">{unreadCount} unread</span>
              </div>
              {notifications.length === 0 ? (
                <p className="px-2 py-5 text-sm text-gray-secondary">You&apos;re all caught up.</p>
              ) : (
                <div className="max-h-80 space-y-1 overflow-y-auto">
                  {notifications.map((notification) => {
                    const unread = notification.status === "created" || notification.status === "delivered";
                    return (
                      <div key={notification.id} className={`rounded-xl p-3 ${unread ? "bg-beige-light" : "bg-white"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-navy">{notification.title}</p>
                            <p className="mt-1 text-xs leading-5 text-gray-secondary">{notification.body}</p>
                          </div>
                          {onDismissNotification && (
                            <button
                              type="button"
                              onClick={() => onDismissNotification(notification.id)}
                              className="text-xs text-gray-secondary underline-offset-2 hover:text-navy hover:underline"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-xs">
                          {unread && onMarkNotificationRead && (
                            <button
                              type="button"
                              onClick={() => onMarkNotificationRead(notification.id)}
                              className="font-semibold text-brown-label hover:text-navy"
                            >
                              Mark read
                            </button>
                          )}
                          {notification.actionUrl && notification.actionLabel && (
                            <a href={notification.actionUrl} className="font-semibold text-brown-label hover:text-navy">
                              {notification.actionLabel}
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

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
