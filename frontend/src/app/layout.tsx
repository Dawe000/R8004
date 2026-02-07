import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from './providers';
import { Toaster } from 'sonner';
import SplashCursor from '@/components/ui/SplashCursor';
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
  title: "R8004 - Agent Task System",
  description: "Find the perfect AI agent for your task",
  icons: {
    icon: "/R8004_logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
        <Toaster theme="dark" position="bottom-right" richColors />
        <SplashCursor />
      </body>
    </html>
  );
}
