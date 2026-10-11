"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";

type AdvisingDocument = {
  type: "transcript" | "curriculum";
  label: string;
  storagePath: string;
  available: boolean;
  size: number | null;
  lastModified: string | null;
};

interface AdvisingDocumentsViewerProps {
  user: User;
}

function formatSize(bytes: number | null) {
  if (bytes === null) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdvisingDocumentsViewer({ user }: AdvisingDocumentsViewerProps) {
  const [documents, setDocuments] = useState<AdvisingDocument[]>([]);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(true);
  const [listError, setListError] = useState<string>("");

  const [selectedType, setSelectedType] = useState<AdvisingDocument["type"] | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string>("");

  // Retrieve the list of uploaded advising documents from storage.
  useEffect(() => {
    let cancelled = false;

    async function loadDocuments() {
      try {
        setIsLoadingList(true);
        setListError("");

        const token = await user.getIdToken();
        const response = await fetch("/api/advising/documents", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Your advising documents could not be loaded.");
        }

        if (!cancelled) setDocuments(data.documents as AdvisingDocument[]);
      } catch (error) {
        if (!cancelled) {
          setListError(error instanceof Error ? error.message : "Your advising documents could not be loaded.");
        }
      } finally {
        if (!cancelled) setIsLoadingList(false);
      }
    }

    loadDocuments();
    return () => { cancelled = true; };
  }, [user]);

  // Free the blob URL when the preview changes or the viewer unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const openDocument = useCallback(async (document: AdvisingDocument) => {
    setSelectedType(document.type);
    setPreviewUrl(null);
    setPreviewError("");

    if (!document.available) {
      setPreviewError(`Your ${document.label.toLowerCase()} isn't available. Try uploading it again with "Replace my documents".`);
      return;
    }

    try {
      setIsLoadingPreview(true);

      // /api/download needs the auth header, which an <iframe src> can't send,
      // so fetch the PDF here and hand the iframe a local blob URL instead.
      const token = await user.getIdToken();
      const response = await fetch(`/api/download?key=${encodeURIComponent(document.storagePath)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? `Your ${document.label.toLowerCase()} could not be found. It may have been removed.`
            : `Your ${document.label.toLowerCase()} could not be opened.`
        );
      }

      const blob = await response.blob();
      setPreviewUrl(URL.createObjectURL(new Blob([blob], { type: "application/pdf" })));
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "This document could not be opened.");
    } finally {
      setIsLoadingPreview(false);
    }
  }, [user]);

  const selectedDocument = documents.find((document) => document.type === selectedType) ?? null;

  return (
    <section
      className="mt-8 rounded-xl bg-bg-container p-6 shadow-sm ring-1 ring-border-light"
      data-tutorial="advising-new-documents"
    >
      <h2 className="text-xl font-semibold">My Documents</h2>
      <p className="mt-2 text-sm text-text-muted">
        View the transcript and curriculum sheet you uploaded to Catalyst.
      </p>

      {isLoadingList && (
        <p className="mt-4 text-sm text-text-muted">Loading your documents...</p>
      )}

      {!isLoadingList && listError && (
        <div className="mt-4 rounded-lg border border-alert-error bg-alert-error-bg px-4 py-3 text-sm text-alert-error">
          {listError}
        </div>
      )}

      {!isLoadingList && !listError && documents.length > 0 && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {documents.map((document) => {
            const isSelected = document.type === selectedType;
            const details = [formatSize(document.size), formatDate(document.lastModified) && `Uploaded ${formatDate(document.lastModified)}`]
              .filter(Boolean)
              .join(" · ");

            return (
              <li key={document.type}>
                <button
                  type="button"
                  onClick={() => openDocument(document)}
                  aria-pressed={isSelected}
                  className={`flex w-full items-center justify-between gap-4 rounded-lg border px-4 py-3 text-left transition
                    ${isSelected ? "border-primary bg-bg-warm" : "border-border-light hover:bg-bg-warm"}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{document.label}</p>
                    <p className="mt-1 truncate text-xs text-text-muted">
                      {document.available ? details || "PDF" : "Not available"}
                    </p>
                  </div>

                  <span className={`whitespace-nowrap text-xs font-medium ${document.available ? "text-primary" : "text-text-muted"}`}>
                    {isSelected ? "Viewing" : "View"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selectedDocument && (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold">{selectedDocument.label}</h3>
            <div className="flex items-center gap-4">
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:text-primary-hover hover:underline"
                >
                  Open in new tab
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  setSelectedType(null);
                  setPreviewUrl(null);
                  setPreviewError("");
                }}
                className="text-sm text-text-muted hover:text-text-main"
              >
                Close
              </button>
            </div>
          </div>

          {isLoadingPreview && (
            <p className="mt-3 text-sm text-text-muted">Opening document...</p>
          )}

          {previewError && (
            <div className="mt-3 rounded-lg border border-alert-error bg-alert-error-bg px-4 py-3 text-sm text-alert-error">
              {previewError}
            </div>
          )}

          {previewUrl && (
            <iframe
              src={previewUrl}
              title={`${selectedDocument.label} preview`}
              className="mt-3 h-[70vh] w-full rounded-lg border border-border-light bg-bg-main"
            />
          )}
        </div>
      )}
    </section>
  );
}
