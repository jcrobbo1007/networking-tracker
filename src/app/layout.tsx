import type { Metadata, Viewport } from "next";
import "./globals.css";

/**
 * Typography note: this uses the platform's own UI font rather than a webfont.
 * It costs nothing to download, renders immediately with no layout shift, and
 * removes a build-time network dependency on Google Fonts. The stack is
 * defined in globals.css as --font-sans.
 */

export const metadata: Metadata = {
  title: "Berkeley Networking Tracker",
  description:
    "A private tracker for the people you want to stay connected with at Berkeley.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Let people zoom. Locking scale is an accessibility failure.
  maximumScale: 5,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
