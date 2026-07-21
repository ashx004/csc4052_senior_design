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
        default: "bg-white text-text-muted ring-1 ring-border-light hover:text-text-main hover:bg-bg-main",
        accent: "bg-primary text-white hover:bg-primary-hover",
        danger: "bg-white text-alert-error ring-1 ring-border-light hover:bg-alert-error-bg",
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