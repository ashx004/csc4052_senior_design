"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { CLASS_COLOR_PALETTE } from "@/src/library/classColors";

interface ClassColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

export default function ClassColorPicker({ color, onChange }: ClassColorPickerProps) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, [open]);

  return (
    <div ref={pickerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-light bg-bg-container text-text-muted shadow-sm transition hover:bg-bg-warm hover:text-text-main focus:outline-none focus:ring-2 focus:ring-primary/30"
        aria-label="Change class color"
        aria-expanded={open}
      >
        <Pencil size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-20 grid w-36 grid-cols-4 gap-2 rounded-xl border border-border-light bg-bg-container p-3 shadow-lg">
          {CLASS_COLOR_PALETTE.map((swatch) => {
            const selected = swatch === color;
            return (
              <button
                key={swatch}
                type="button"
                style={{ backgroundColor: swatch }}
                className={`h-5 w-5 rounded-full border transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                  selected ? "border-text-main ring-2 ring-primary/30" : "border-black/10"
                }`}
                onClick={() => {
                  onChange(swatch);
                  setOpen(false);
                }}
                aria-label={`Set class color to ${swatch}`}
                aria-pressed={selected}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
