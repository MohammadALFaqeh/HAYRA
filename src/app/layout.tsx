import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "حيرة | HAYRA", template: "%s | حيرة" },
  description: "حيرة — لعبة أسئلة جماعية بين فريقين بأجواء برامج المسابقات: لوحة فئات، سرقة، وسائل مساعدة، وتحديات QR.",
  applicationName: "حيرة",
  openGraph: { title: "حيرة | HAYRA", description: "مين أذكى؟ فريقين، لوحة أسئلة، وحيرة كبيرة!", images: ["/brand/og.png"], locale: "ar" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#080d2e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&family=Baloo+Bhaijaan+2:wght@500;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
