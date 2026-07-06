import type { Metadata } from "next";
import "./global.css";
import { AuthProvider } from "@/src/context/AuthContext";

export const metadata: Metadata = {
  title: "studora",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
