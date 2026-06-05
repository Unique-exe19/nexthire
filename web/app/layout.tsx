import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
