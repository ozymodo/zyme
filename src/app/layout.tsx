import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import ApplySettings from "@/components/settings/ApplySettings";
import LevelColors from "@/components/account/LevelColors";
import SceneProvider from "@/components/scene/SceneProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "zyme",
  description: "games, blog posts, and media, all in one living space.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ApplySettings />
        <LevelColors />
        <SceneProvider>{children}</SceneProvider>
      </body>
    </html>
  );
}
