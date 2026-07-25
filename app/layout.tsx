import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interview Practice — Mock interviewer",
  description: "A focused, local-first mock interview practice experience.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
