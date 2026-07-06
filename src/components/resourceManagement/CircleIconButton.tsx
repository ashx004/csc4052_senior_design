"use client";

import { ReactNode } from "react";

interface CircleIconButtonProps {
    icon: ReactNode;
    onClick?: () => void;
    ariaLabel: string;
    variant?: "default" | "accent" | "danger";
    size?: "sm" | "md";
    disabled?: boolean;
}

export default function CircleIconButton({
    icon,
    onClick,
    ariaLabel,
    variant = "default",
    size = "md",
    disabled = false,
}: CircleIconButtonProps) {
    const sizeClasses = size === "sm" ? "h-7 w-7" : "h-9 w-9";

    const variantClasses = {
        default: "bg-white text-[#8A8477] ring-1 ring-[#EDE6D8] hover:text-[#3D3A34] hover:bg-[#FAF7F0]",
        accent: "bg-[#B08957] text-white hover:bg-[#9C7849]",
        danger: "bg-white text-[#C2685A] ring-1 ring-[#EDE6D8] hover:bg-[#FBEFED]",
    }[variant];

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={ariaLabel}
            disabled={disabled}
            className={`flex ${sizeClasses} shrink-0 items-center justify-center rounded-full shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${variantClasses}`}
        >
            {icon}
        </button>
    );
}