import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rankenstein",
  description: "Autonomous, self-correcting content that publishes only after it proves itself.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col" style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
