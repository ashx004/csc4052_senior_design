"use client";

import { useEffect, useState } from "react";
import { Pin, PinOff, Trash2, X } from "lucide-react";
import { ChatSessionSummary, listChatSessions, setChatPinned, deleteChatSession } from "@/src/library/chatMemory";

interface ChatHistoryPanelProps {
  userId: string;
  activeSessionId: string | null;
  onClose: () => void;
  onSelect: (sessionId: string) => void;
}

function formatRelativeDate(date: Date | null): string {
  if (!date) return "";
  const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function ChatHistoryPanel({ userId, activeSessionId, onClose, onSelect }: ChatHistoryPanelProps) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    listChatSessions(userId)
      .then(setSessions)
      .catch((error) => console.error("Error loading chat history:", error))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function togglePin(session: ChatSessionSummary) {
    setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, pinned: !s.pinned } : s)));
    try {
      await setChatPinned(userId, session.id, !session.pinned);
      refresh();
    } catch (error) {
      console.error("Error toggling pin:", error);
      refresh();
    }
  }

  async function remove(session: ChatSessionSummary) {
    if (!confirm(`Delete "${session.title}"? This can't be undone.`)) return;
    setSessions((prev) => prev.filter((s) => s.id !== session.id));
    try {
      await deleteChatSession(userId, session.id);
    } catch (error) {
      console.error("Error deleting chat:", error);
      refresh();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-sm flex-col bg-bg-container shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
          <h2 className="text-sm font-semibold text-text-main">Previous chats</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-text-muted hover:bg-bg-warm hover:text-text-main"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="p-4 text-center text-xs text-text-muted">Loading…</p>
          ) : sessions.length === 0 ? (
            <p className="p-4 text-center text-xs text-text-muted">No previous chats yet.</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onSelect(session.id)}
                className={`group mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  session.id === activeSessionId ? "bg-bg-warm" : "hover:bg-bg-warm"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text-main">{session.title}</p>
                  <p className="text-xs text-text-muted">{formatRelativeDate(session.updatedAt)}</p>
                </div>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePin(session);
                  }}
                  className={`shrink-0 rounded-md p-1.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white ${
                    session.pinned ? "text-primary opacity-100" : "text-text-muted"
                  }`}
                  aria-label={session.pinned ? "Unpin chat" : "Pin chat"}
                >
                  {session.pinned ? <Pin size={14} /> : <PinOff size={14} />}
                </button>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(session);
                  }}
                  className="shrink-0 rounded-md p-1.5 text-text-muted opacity-0 transition-opacity hover:bg-white hover:text-alert-error group-hover:opacity-100"
                  aria-label="Delete chat"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border-light px-4 py-2.5 text-center text-[11px] text-text-muted">
          Chats auto-delete 30 days after they're started. Pin one to keep it forever.
        </div>
      </div>
    </div>
  );
}
