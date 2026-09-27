"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type SharedNote = { id: string; title: string; kind: "typed" | "document"; plainText: string; fileType: string; url: string | null };
type ShareMeta = { title: string; type: string; passwordRequired: boolean; allowEdit: boolean };

function SharedNoteCard({ note, shareId, allowEdit }: { note: SharedNote; shareId: string; allowEdit: boolean }) {
  const [text, setText] = useState(note.plainText ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    setStatus("saving");
    try {
      const response = await fetch("/api/note-shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "edit", id: shareId, noteId: note.id, plainText: text }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't save your changes.");
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <article className="rounded-xl border border-border-light bg-bg-container p-5">
      <h2 className="font-semibold text-text-main">{note.title}</h2>
      {note.kind === "document" && note.url && <a href={`/api/note-shares/file?share=${encodeURIComponent(shareId)}&note=${encodeURIComponent(note.id)}`} className="mt-3 inline-block text-sm font-medium text-primary underline">Open {note.fileType || "file"}</a>}
      {note.kind === "document" && !note.url && <p className="mt-3 text-sm text-text-muted">File unavailable</p>}
      {allowEdit ? (
        <div className="mt-3">
          <label className="block text-xs font-medium text-text-muted">{note.kind === "typed" ? "Note text" : "Notes and annotations"}</label>
          <textarea value={text} onChange={(event) => { setText(event.target.value); setStatus("idle"); }} maxLength={100_000} className="mt-1 min-h-36 w-full resize-y rounded-lg border border-border-light bg-bg-main p-3 text-sm text-text-main outline-none focus:border-primary" />
          <div className="mt-2 flex items-center gap-3"><button type="button" disabled={status === "saving"} onClick={() => void save()} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-text-inverse disabled:opacity-50">{status === "saving" ? "Saving…" : "Save changes"}</button>{status === "saved" && <span className="text-xs text-text-muted">Saved</span>}{status === "error" && <span className="text-xs text-alert-error">Couldn&apos;t save changes.</span>}</div>
        </div>
      ) : note.kind === "typed" ? <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-text-main">{text || "Empty note"}</pre> : text ? <p className="mt-3 whitespace-pre-wrap text-sm text-text-main">{text}</p> : null}
    </article>
  );
}

export default function SharedNotePage() {
  const { shareId } = useParams<{ shareId: string }>();
  const [meta, setMeta] = useState<ShareMeta | null>(null);
  const [notes, setNotes] = useState<SharedNote[] | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function access(value: string) {
    const response = await fetch("/api/note-shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "access", id: shareId, password: value }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Couldn't open this share."); return; }
    setNotes(data.notes);
  }

  useEffect(() => {
    fetch(`/api/note-shares?id=${encodeURIComponent(shareId)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "This share link is unavailable.");
        setMeta(data);
        if (!data.passwordRequired) void access("");
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "This share link is unavailable."));
  // Access is deliberately started only once metadata is known.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId]);

  function submitPassword(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void access(password); }

  if (!meta) return <main className="mx-auto max-w-3xl p-8 text-sm text-text-muted">{error || "Opening shared material…"}</main>;
  if (!notes) return <main className="mx-auto flex min-h-screen max-w-sm items-center p-6"><form onSubmit={submitPassword} className="w-full rounded-2xl border border-border-light bg-bg-container p-6"><h1 className="text-xl font-semibold text-text-main">{meta.title}</h1><p className="mt-2 text-sm text-text-muted">{meta.passwordRequired ? "Enter the password to view this shared material." : "Opening shared material…"}</p>{meta.passwordRequired && <><input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-4 w-full rounded-lg border border-border-light px-3 py-2" /><button className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse">Open</button></>}{error && <p className="mt-3 text-sm text-alert-error">{error}</p>}</form></main>;
  return <main className="mx-auto max-w-3xl p-6 sm:p-10"><h1 className="text-2xl font-semibold text-text-main">{meta.title}</h1><p className="mt-1 text-sm text-text-muted">Shared {meta.type}{meta.allowEdit ? " · Editing enabled" : " · View only"}</p><div className="mt-6 space-y-5">{notes.map((note) => <SharedNoteCard key={note.id} note={note} shareId={shareId} allowEdit={meta.allowEdit} />)}</div></main>;
}
