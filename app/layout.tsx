import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Datasheet Analiz",
  description:
    "Datasheet yükle, soru sor, iki datasheet'i karşılaştır. Her değer sayfa referansı ve alıntıyla gelir.",
  authors: [
    { name: "Ali Salih Yıldırım", url: "https://github.com/alislhyldrm" },
  ],
  creator: "Ali Salih Yıldırım",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e7edef" },
    { media: "(prefers-color-scheme: dark)", color: "#092339" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// Runs synchronously during head parsing, before first paint, so the stored
// preference (or the OS setting) wins without a flash of the wrong theme.
const themeScript = `(function(){try{var s=localStorage.getItem("theme");var t=s==="light"||s==="dark"?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* No background utility: the mesh is painted on <body> in globals.css
          and every surface above it is translucent. */}
      <body className="min-h-full text-ink">{children}</body>
    </html>
  );
}
