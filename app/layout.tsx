import type { Metadata } from "next";
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
  title: "家系図アプリ",
  description: "家系図を作成・管理できるアプリ",

  // PWA
  manifest: "/manifest.json",

  // アイコン設定
  icons: {
    icon: "/icon.png",              // ブラウザタブ
    apple: "/icons/icon-180.png",   // iPhoneホーム
  },

  // iPhoneアプリ風
  appleWebApp: {
    capable: true,
    title: "家系図",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
