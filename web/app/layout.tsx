import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font — no runtime request to Google,
// no flash-of-unstyled-text, and consistent with the project's offline-first design.
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-sans",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NextHire — AI Recruiter Dashboard",
  description:
    "Intelligent candidate discovery and ranking powered by semantic AI. NextHire ranks candidates the way an experienced recruiter would — understanding real fit, not just keywords.",
  keywords: ["AI recruiter", "candidate ranking", "semantic search", "talent discovery"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
