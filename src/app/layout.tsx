import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Quiz Platform",
  description: "AI Personal Learning Platform — สร้าง Quiz จากข้อสอบของคุณเองด้วย AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
