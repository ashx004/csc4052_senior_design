import type { MetadataRoute } from "next";

// Makes the site installable: "Add to Home Screen" on iPhone, "Install app"
// in Chrome, and the source of truth the Android app (android/) is built from.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Catalyst",
    short_name: "Catalyst",
    description: "Study smarter with your classes, notes and an AI tutor in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FAFAF8",
    theme_color: "#FAFAF8",
    icons: [
      { src: "/app-icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
