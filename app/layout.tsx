import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: (() => {
    try {
      const raw = process.env.NEXT_PUBLIC_SITE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      return new URL(raw);
    } catch {
      return new URL("http://localhost:3000");
    }
  })(),
  title: "Rehab Area",
  description: "Gestionale area riabilitazione USC Cremonese",
  manifest: "/manifest.json?v=3",
  icons: {
    icon: "/favicon.svg?v=2",
    apple: [{ url: "/apple-touch-icon-v2.png", sizes: "512x512", type: "image/png" }],
  },
  openGraph: {
    title: "Rehab Area",
    description: "Gestionale area riabilitazione USC Cremonese",
    siteName: "Rehab Area",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Rehab Area" }],
    locale: "it_IT",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Rehab Area",
    description: "Gestionale area riabilitazione USC Cremonese",
    images: ["/og-image.png"],
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head>
        {/* Force iOS to always re-fetch the touch icon (bypass cache) */}
        <link rel="apple-touch-icon" href="/apple-touch-icon-v2.png" />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
              registrations.forEach(function(r) { r.update(); });
            });
          }
        ` }} />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
