"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, RefreshCw, X } from "lucide-react";

/**
 * Takes photos of documents with the device camera for OCR. Uses a live
 * viewfinder (getUserMedia) so several pages can be captured in a row; if
 * the camera can't be opened that way (permission denied, no camera, an
 * in-app browser), it falls back to the device's own camera app via a
 * file input with `capture`, which phones support natively.
 */
export default function CameraCaptureModal({
  onDone,
  onClose,
  maxPhotos,
}: {
  onDone: (files: File[]) => void;
  onClose: () => void;
  maxPhotos: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [status, setStatus] = useState<"starting" | "live" | "fallback">("starting");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("fallback");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStatus("live");
      } catch (e) {
        const name = (e as DOMException)?.name;
        setMessage(
          name === "NotAllowedError"
            ? "Camera access is blocked. Allow it in your browser's site settings, or use your device's camera below."
            : "Couldn't open the camera here. You can use your device's camera instead."
        );
        setStatus("fallback");
      }
    }
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || photos.length >= maxPhotos) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `scan-page-${photos.length + 1}.jpg`, { type: "image/jpeg" });
        setPhotos((prev) => [...prev, { file, url: URL.createObjectURL(blob) }]);
      },
      "image/jpeg",
      0.9
    );
  }

  function addFallbackFiles(list: FileList | null) {
    if (!list) return;
    const room = maxPhotos - photos.length;
    const added = Array.from(list)
      .slice(0, room)
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPhotos((prev) => [...prev, ...added]);
  }

  const full = photos.length >= maxPhotos;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3" role="dialog" aria-modal="true" aria-label="Scan with camera">
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-bg-container shadow-xl">
        <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
          <h3 className="text-sm font-semibold text-text-main">Scan with camera</h3>
          <button type="button" onClick={onClose} aria-label="Close camera" className="rounded-full p-1.5 text-text-muted hover:bg-bg-warm">
            <X size={18} />
          </button>
        </div>

        <div className="relative bg-black">
          {status !== "fallback" ? (
            <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-contain" />
          ) : (
            <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 p-6 text-center">
              {message && <p className="text-sm text-white/80">{message}</p>}
              <button
                type="button"
                onClick={() => fallbackInputRef.current?.click()}
                disabled={full}
                className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
              >
                <Camera size={16} /> Use device camera
              </button>
            </div>
          )}
          {status === "starting" && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Opening camera...</p>}
          <input
            ref={fallbackInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              addFallbackFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {photos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto border-t border-border-light p-3">
            {photos.map((p, i) => (
              <div key={p.url} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Captured page ${i + 1}`} className="h-16 w-12 rounded object-cover ring-1 ring-border-light" />
                <button
                  type="button"
                  aria-label={`Remove page ${i + 1}`}
                  onClick={() => setPhotos((prev) => prev.filter((x) => x.url !== p.url))}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-text-main text-bg-container"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border-light p-3">
          {status === "live" && (
            <button
              type="button"
              onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
              aria-label="Switch camera"
              title="Switch camera"
              className="flex h-10 w-10 items-center justify-center rounded-full text-text-main hover:bg-bg-warm"
            >
              <RefreshCw size={17} />
            </button>
          )}
          {status === "live" && (
            <button
              type="button"
              onClick={capture}
              disabled={full}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-50"
            >
              <Camera size={16} /> {full ? `Up to ${maxPhotos} pages` : `Take photo${photos.length ? ` (${photos.length})` : ""}`}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDone(photos.map((p) => p.file))}
            disabled={photos.length === 0}
            className={`flex items-center justify-center gap-1.5 rounded-full border border-border-light px-4 py-2.5 text-sm font-medium text-text-main hover:bg-bg-warm disabled:opacity-40 ${status === "live" ? "" : "flex-1"}`}
          >
            <Check size={15} /> Use {photos.length || ""} {photos.length === 1 ? "photo" : "photos"}
          </button>
        </div>
      </div>
    </div>
  );
}
