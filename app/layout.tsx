import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Absolute site URL (set by the Pages workflow). Link previews on X need an
// absolute image URL, so the share card is only declared when it is known.
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
const shareImage = siteUrl ? `${siteUrl}/share/tiers-latest.png` : null;

export const metadata: Metadata = {
  title: "LLM 模型对比 · 大模型梯队榜",
  description: "大模型梯队榜：按与榜首的差距分档，同档按价格排，附价格与使用热度",
  ...(shareImage
    ? {
        openGraph: {
          title: "大模型梯队榜",
          description: "按与榜首的差距每 5 分一档，同档按价格从低到高",
          images: [{ url: shareImage, width: 1200, height: 675 }],
        },
        twitter: {
          card: "summary_large_image",
          title: "大模型梯队榜",
          images: [shareImage],
        },
      }
    : {}),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${plexSans.variable} ${plexMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  );
}
