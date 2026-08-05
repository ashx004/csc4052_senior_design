// The full-color gradient logo (public/app-logo.svg) uses a dark
// brown/black palette tuned for light backgrounds — on the near-black
// backgrounds of the dark theme (default dark or coffee-dark) it was
// nearly invisible. public/app-logo-dark.svg recolors the same shapes into
// lighter golds for contrast there. Two plain <img> tags toggled by
// Tailwind's dark: variant (driven by the same .dark class as the rest of
// the app's theming), not one image — an <img>-embedded SVG can't react to
// page CSS/currentColor, so swapping the whole file is the only way to
// pick the right version per theme.
export default function AppLogo({ className }: { className?: string }) {
  return (
    <>
      <img src="/app-logo.svg" alt="Catalyst logo" className={`${className ?? ""} dark:hidden`} />
      <img src="/app-logo-dark.svg" alt="Catalyst logo" className={`hidden dark:block ${className ?? ""}`} />
    </>
  );
}
