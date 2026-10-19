"use client";

import { useState } from "react";
import { Copy, Download, Link2, Loader2 } from "lucide-react";
import ExportMenu, { type ExportSource } from "./ExportMenu";
import { MAX_INVITED_EMAILS, parseInvitedEmails, type ShareAudience } from "@/src/library/notes/shareAccess";
import PasswordInput from "@/src/components/PasswordInput";

const AUDIENCE_OPTIONS: { value: ShareAudience; label: string; hint: string }[] = [
  { value: "anyone", label: "Anyone with the link", hint: "No account needed." },
  { value: "signedIn", label: "Any Catalyst user", hint: "Visitors sign in or create an account first." },
  { value: "invited", label: "Only specific people", hint: "Visitors sign in with an email you list." },
];

/**
 * Share a note or notebook by link. For an open note it also offers the export
 * formats (PDF, Markdown, ...), since sharing a copy and downloading one are
 * the same kind of "get this out of here" - `exportSource` is only passed from
 * the note page, where the editor can supply it.
 */
export default function ShareNoteModal({
  type,
  id,
  onClose,
  exportSource,
  typedNote = false,
}: {
  type: "note" | "notebook";
  id: string;
  onClose: () => void;
  /** Reads what an export needs from the open editor, when it is ready. */
  exportSource?: () => ExportSource | null;
  typedNote?: boolean;
}) {
  const [password, setPassword] = useState("");
  const [allowEdit, setAllowEdit] = useState(false);
  const [audience, setAudience] = useState<ShareAudience>("anyone");
  const [emails, setEmails] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function create() {
    setError("");
    if (audience === "invited") {
      const { emails: list, invalid } = parseInvitedEmails(emails);
      if (invalid.length) return setError(`These don't look like email addresses: ${invalid.slice(0, 3).join(", ")}.`);
      if (list.length === 0) return setError("Add at least one email address to invite.");
      if (list.length > MAX_INVITED_EMAILS) return setError(`You can invite up to ${MAX_INVITED_EMAILS} people.`);
    }
    setLoading(true);
    try {
      const response = await fetch("/api/note-shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, id, password, allowEdit, audience, invitedEmails: audience === "invited" ? emails : undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't create a link.");
      setLink(`${window.location.origin}/share/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create a link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={exportSource ? `Share or export ${type}` : `Share ${type}`}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-bg-container p-6 shadow-xl ${exportSource ? "max-w-md" : "max-w-sm"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="flex items-center gap-2 text-base font-semibold text-text-main">
          <Link2 size={16} aria-hidden="true" /> Share {type}
        </h3>
        <p className="mt-1 text-sm text-text-muted">Choose who can open the link. A password is optional.</p>

        {!link ? (
          <>
            <fieldset className="mt-4 space-y-2">
              <legend className="sr-only">Who can open this link</legend>
              {AUDIENCE_OPTIONS.map((option) => (
                <label key={option.value} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${audience === option.value ? "border-primary bg-bg-warm" : "border-border-light"}`}>
                  <input type="radio" name="share-audience" value={option.value} checked={audience === option.value} onChange={() => setAudience(option.value)} className="mt-0.5 h-4 w-4 accent-primary" />
                  <span>
                    <span className="font-medium text-text-main">{option.label}</span>
                    <br />
                    <span className="text-text-muted">{option.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {audience === "invited" && (
              <label className="mt-3 block text-sm font-medium text-text-main">
                Email addresses
                <textarea
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  rows={3}
                  placeholder="friend@school.edu, classmate@school.edu"
                  className="mt-1 w-full resize-y rounded-lg border border-border-light bg-bg-container px-3 py-2 text-sm font-normal"
                />
                <span className="text-xs font-normal text-text-muted">Separate with commas or new lines. Up to {MAX_INVITED_EMAILS}. They need a verified Catalyst account with that email.</span>
              </label>
            )}
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Optional password" aria-label="Optional password" className="mt-3 w-full rounded-lg border border-border-light bg-bg-container px-3 py-2 text-sm" />
            <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-text-main">
              <input type="checkbox" checked={allowEdit} onChange={(e) => setAllowEdit(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
              <span>
                <span className="font-medium">Allow editing</span>
                <br />
                <span className="text-text-muted">Recipients can edit shared note text and document annotations{audience === "anyone" ? " without an account" : ""}.</span>
              </span>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              {!exportSource && (
                <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm">
                  Cancel
                </button>
              )}
              <button type="button" disabled={loading} onClick={() => void create()} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-text-inverse">
                {loading && <Loader2 className="mr-1 inline animate-spin" size={14} />}Create link
              </button>
            </div>
          </>
        ) : (
          <>
            <input readOnly value={link} aria-label="Share link" className="mt-4 w-full rounded-lg border border-border-light bg-bg-main px-3 py-2 text-sm" />
            <button type="button" onClick={() => void navigator.clipboard.writeText(link)} className="mt-3 flex items-center gap-1.5 rounded-lg border border-border-light px-3 py-2 text-sm">
              <Copy size={14} /> Copy link
            </button>
          </>
        )}
        {error && <p className="mt-3 text-sm text-alert-error">{error}</p>}

        {exportSource && (
          <section className="mt-6 border-t border-border-light pt-5" aria-label="Export">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-text-main">
              <Download size={15} aria-hidden="true" /> Export a copy
            </h4>
            <p className="mb-2 mt-0.5 text-xs text-text-muted">Download this {type} as a file.</p>
            <ExportMenu source={exportSource} typedNote={typedNote} variant="list" />
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm">
                Close
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
