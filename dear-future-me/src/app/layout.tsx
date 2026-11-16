import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Instrument_Serif } from "next/font/google";
import "./globals.css";

const serif = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Dear Future Me — Capture today. Meet yourself tomorrow.", template: "%s · Dear Future Me" },
  description: "Seal photographs, videos, voice notes and letters in a digital time capsule, and receive them on the day you choose — next year, or twenty years from now.",
  applicationName: "Dear Future Me",
  openGraph: {
    title: "Dear Future Me",
    description: "Capture today. Meet yourself tomorrow.",
    type: "website",
    siteName: "Dear Future Me",
  },
  twitter: { card: "summary_large_image", title: "Dear Future Me", description: "Capture today. Meet yourself tomorrow." },
};

export const viewport: Viewport = { themeColor: "#080A12", colorScheme: "dark", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${serif.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:text-sm focus:text-ink">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
