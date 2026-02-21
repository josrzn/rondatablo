import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rondatablo Pilot v0",
  description: "Local-first debate production environment."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
