"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

export const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5];

export function usePaperZoom() {
  const [step, setStep] = useState(0);
  return {
    zoom: ZOOM_STEPS[step],
    canZoomIn: step < ZOOM_STEPS.length - 1,
    canZoomOut: step > 0,
    zoomIn: () => setStep((s) => Math.min(ZOOM_STEPS.length - 1, s + 1)),
    zoomOut: () => setStep((s) => Math.max(0, s - 1)),
    reset: () => setStep(0),
  };
}

export type PaperZoom = ReturnType<typeof usePaperZoom>;

export function ZoomButtons({ zoom }: { zoom: PaperZoom }) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Zoom">
      <button type="button" aria-label="Zoom out" disabled={!zoom.canZoomOut} onClick={zoom.zoomOut} className="rounded-full p-1.5 hover:bg-bg-warm disabled:opacity-30">
        <Minus size={15} />
      </button>
      <button type="button" aria-label="Fit page to width" disabled={!zoom.canZoomOut} onClick={zoom.reset} className="min-w-[2.75rem] rounded-md px-1 py-0.5 text-center text-xs font-medium tabular-nums hover:bg-bg-warm disabled:hover:bg-transparent">
        {zoom.zoom === 1 ? "Fit" : `${Math.round(zoom.zoom * 100)}%`}
      </button>
      <button type="button" aria-label="Zoom in" disabled={!zoom.canZoomIn} onClick={zoom.zoomIn} className="rounded-full p-1.5 hover:bg-bg-warm disabled:opacity-30">
        <Plus size={15} />
      </button>
    </div>
  );
}

export function FloatingZoom({ zoom }: { zoom: PaperZoom }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-10 flex justify-center px-3">
      <div className="pointer-events-auto rounded-full border border-border-light bg-bg-container px-1.5 py-1 text-text-main shadow-md">
        <ZoomButtons zoom={zoom} />
      </div>
    </div>
  );
}
