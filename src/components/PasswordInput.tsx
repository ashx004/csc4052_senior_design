"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

// Drop-in for <input type="password"> with a show/hide toggle. The caller's
// className styles the input as before; the eye sits inside its right edge.
export default function PasswordInput({ className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <div className="relative w-full">
      <input {...props} type={visible ? "text" : "password"} className={`${className} w-full pr-10`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-text-muted hover:text-text-main"
      >
        <Icon size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
