import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import './global.css';
import { AuthProvider } from "@/src/context/AuthContext";
import { StudyPlanProvider } from "@/src/context/StudyPlanContext";
import { TutorialProvider } from "@/src/context/TutorialContext";
import FocusBar from "@/src/components/studyPlan/FocusBar";
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
          {/* Study sessions outlive any single route group — the focus bar
              lives here so it stays visible on the course pages a started
              task navigates to, not just the dashboard. */}
          <StudyPlanProvider>
            <FocusBar />
            {/* Mounted once at the root (not per-layout) so a user's
                tutorial progress survives navigating between the dashboard
                and course route groups without refetching. */}
            <TutorialProvider>{children}</TutorialProvider>
          </StudyPlanProvider>
        </AuthProvider>
      </body>
    </html>
  );
}