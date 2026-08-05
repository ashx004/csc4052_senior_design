"use client";

import { ChangeEvent, FormEvent, useState } from "react";

interface AdvisingUploadModalProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

export default function AdvisingUploadModal({
  userId,
  isOpen,
  onClose,
  onUploaded,
}: AdvisingUploadModalProps) {
  const [transcript, setTranscript] = useState<File | null>(null);
  const [curriculum, setCurriculum] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!isOpen) {
    return null;
  }

  function handleTranscriptChange(event: ChangeEvent<HTMLInputElement>) {
    setTranscript(event.target.files?.[0] ?? null);
    setErrorMessage("");
  }

  function handleCurriculumChange(event: ChangeEvent<HTMLInputElement>) {
    setCurriculum(event.target.files?.[0] ?? null);
    setErrorMessage("");
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!transcript || !curriculum) {
      setErrorMessage("Please select both your transcript and curriculum sheet.");
      return;
    }

    try {
      setIsUploading(true);
      setErrorMessage("");

      const formData = new FormData();

      formData.append("userId", userId);
      formData.append("transcript", transcript);
      formData.append("curriculum", curriculum);

      const response = await fetch("/api/advising/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ?? "The documents could not be uploaded."
        );
      }

      onUploaded();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The documents could not be uploaded."
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="relative w-full max-w-md rounded-xl border border-border-light bg-bg-container p-6 text-text-main shadow-xl">
        <button
          type="button"
          onClick={onClose}
          disabled={isUploading}
          className="absolute right-4 top-3 text-xl text-text-muted hover:text-text-main disabled:opacity-50"
          aria-label="Close upload popup"
        >
          ×
        </button>

        <h2 className="pr-8 text-xl font-semibold">
          Upload advising documents
        </h2>

        <p className="mt-2 text-sm leading-6 text-text-muted">
          Select a PDF copy of your transcript and curriculum sheet.
        </p>

        <form 
            onSubmit={handleUpload} 
            className="mt-6 space-y-5">
          <div>
            <label
              htmlFor="transcript"
              className="mb-2 block text-sm font-medium" >
              Transcript
            </label>

            <input
              id="transcript"
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleTranscriptChange}
              disabled={isUploading}
              className="block w-full rounded-lg border border-border-light bg-bg-main p-2 text-sm"
            />

            {transcript && (
              <p className="mt-2 text-xs text-text-muted">
                Selected: {transcript.name}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="curriculum"
              className="mb-2 block text-sm font-medium"
            >
              Curriculum Sheet
            </label>

            <input
              id="curriculum"
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleCurriculumChange}
              disabled={isUploading}
              className="block w-full rounded-lg border border-border-light bg-bg-main p-2 text-sm"
            />

            {curriculum && (
              <p className="mt-2 text-xs text-text-muted">
                Selected: {curriculum.name}
              </p>
            )}
          </div>

          {errorMessage && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="flex-1 rounded-lg border border-border-light px-4 py-2.5 text-sm font-medium hover:bg-bg-warm disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={ isUploading || !transcript || !curriculum }
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50" >
              {isUploading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}