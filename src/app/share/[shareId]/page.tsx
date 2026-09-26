"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type SharedNote = { id: string; title: string; kind: "typed" | "document"; plainText: string; fileType: string; url: string | null };
export default function SharedNotePage() {
  const { shareId } = useParams<{ shareId: string }>();
  const [meta, setMeta] = useState<{ title: string; type: string; passwordRequired: boolean } | null>(null);
  const [notes, setNotes] = useState<SharedNote[] | null>(null);
  const [password, setPassword] = useState(""); const [error, setError] = useState("");
  useEffect(() => { fetch(`/api/note-shares?id=${encodeURIComponent(shareId)}`).then((r) => r.json()).then((data) => { setMeta(data); if (!data.passwordRequired) return access(""); }).catch(() => setError("This share link is unavailable.")); }, [shareId]);
  async function access(value: string) { const r = await fetch("/api/note-shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "access", id: shareId, password: value }) }); const data = await r.json(); if (!r.ok) { setError(data.error || "Couldn't open this share."); return; } setNotes(data.notes); }
  if (!meta) return <main className="mx-auto max-w-3xl p-8 text-sm text-text-muted">Opening shared material…</main>;
  if (!notes) return <main className="mx-auto flex min-h-screen max-w-sm items-center p-6"><form onSubmit={(e) => { e.preventDefault(); void access(password); }} className="w-full rounded-2xl border border-border-light bg-bg-container p-6"><h1 className="text-xl font-semibold text-text-main">{meta.title}</h1><p className="mt-2 text-sm text-text-muted">{meta.passwordRequired ? "Enter the password to view this shared material." : "Opening shared material…"}</p>{meta.passwordRequired && <><input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-4 w-full rounded-lg border border-border-light px-3 py-2" /><button className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse">Open</button></>}{error && <p className="mt-3 text-sm text-alert-error">{error}</p>}</form></main>;
  return <main className="mx-auto max-w-3xl p-6 sm:p-10"><h1 className="text-2xl font-semibold text-text-main">{meta.title}</h1><p className="mt-1 text-sm text-text-muted">Shared {meta.type}</p><div className="mt-6 space-y-5">{notes.map((note) => <article key={note.id} className="rounded-xl border border-border-light bg-bg-container p-5"><h2 className="font-semibold text-text-main">{note.title}</h2>{note.kind === "typed" ? <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-text-main">{note.plainText || "Empty note"}</pre> : note.url ? <a href={`/api/note-shares/file?share=${encodeURIComponent(shareId)}&note=${encodeURIComponent(note.id)}`} className="mt-3 inline-block text-sm font-medium text-primary underline">Open {note.fileType || "file"}</a> : <p className="mt-3 text-sm text-text-muted">File unavailable</p>}</article>)}</div></main>;
}
