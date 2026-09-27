"use client";

import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";

export default function ShareNoteModal({ type, id, onClose }: { type: "note" | "notebook"; id: string; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [allowEdit, setAllowEdit] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function create() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/note-shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, id, password, allowEdit }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't create a link.");
      setLink(`${window.location.origin}/share/${data.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't create a link."); }
    finally { setLoading(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}><div className="w-full max-w-sm rounded-2xl bg-bg-container p-6 shadow-xl" onClick={(e) => e.stopPropagation()}><h3 className="text-base font-semibold text-text-main">Share {type}</h3><p className="mt-1 text-sm text-text-muted">Anyone with this link can open it without an account. A password is optional.</p>{!link ? <><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Optional password" className="mt-4 w-full rounded-lg border border-border-light bg-bg-container px-3 py-2 text-sm" /><label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-text-main"><input type="checkbox" checked={allowEdit} onChange={(e) => setAllowEdit(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" /><span><span className="font-medium">Allow editing</span><br /><span className="text-text-muted">Recipients can edit shared note text and document annotations without an account.</span></span></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm">Cancel</button><button type="button" disabled={loading} onClick={() => void create()} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-text-inverse">{loading && <Loader2 className="mr-1 inline animate-spin" size={14} />}Create link</button></div></> : <><input readOnly value={link} className="mt-4 w-full rounded-lg border border-border-light bg-bg-main px-3 py-2 text-sm" /><button type="button" onClick={() => void navigator.clipboard.writeText(link)} className="mt-3 flex items-center gap-1.5 rounded-lg border border-border-light px-3 py-2 text-sm"><Copy size={14} /> Copy link</button></>}{error && <p className="mt-3 text-sm text-alert-error">{error}</p>}</div></div>;
}
