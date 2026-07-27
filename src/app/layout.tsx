import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import './global.css';
import { AuthProvider } from "@/src/context/AuthContext";
import ThemeInitializer from "@/src/components/ThemeInitializer";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Catalyst",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body 
        className="
          min-h-screen
          bg-bg-main
          text-text-main
          antialiased
          transition-colors
          duration-300
        "
      >
        <ThemeInitializer />

        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}