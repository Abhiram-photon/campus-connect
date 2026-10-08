import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Campus Workspace",
  description: "A private campus collaboration workspace for students, faculty, and event organizers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
