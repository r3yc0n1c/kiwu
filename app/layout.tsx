import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const spaceGroteskHeading = Space_Grotesk({ subsets: ["latin"], variable: "--font-heading" });

const notoSans = Noto_Sans({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kiwu",
  description: "Fastest place to put something you don't want to keep in your head.",
  appleWebApp: {
    title: "Kiwu",
    statusBarStyle: "default",
    capable: true,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        notoSans.variable,
        spaceGroteskHeading.variable,
      )}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col dark">{children}</body>
    </html>
  );
}
