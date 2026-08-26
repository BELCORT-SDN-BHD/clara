import type { Metadata } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";

import { SessionTokenBridge } from "@/components/session-token-bridge";

import "./globals.css";

// Local ClaraBook typefaces (public/brand/fonts/ — ported from clarabook-frontend
// g5-design-system @ a86e48a, OFL-licensed; LICENSE files sit alongside).
// `--font-source-sans` / `--font-source-serif` feed globals.css's
// `--font-sans` / `--font-serif` theme tokens (docs/01-TOKEN-CONTRACT.md §4.1).
const sourceSans = localFont({
  src: [
    {
      path: "../public/brand/fonts/SourceSans3-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/brand/fonts/SourceSans3-Semibold.ttf",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-source-sans",
  display: "swap",
});

const sourceSerif = localFont({
  src: "../public/brand/fonts/SourceSerif4-Regular.ttf",
  weight: "400",
  style: "normal",
  variable: "--font-source-serif",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sourceSans.variable} ${sourceSerif.variable}`}
    >
      <body className="font-sans antialiased">
        <NextIntlClientProvider>
          <SessionTokenBridge />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
