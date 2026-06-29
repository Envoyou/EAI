import type { Metadata, Viewport } from "next";
import { Lora, DM_Serif_Display, Inter, JetBrains_Mono } from "next/font/google";
import "../globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "EAI — Envoyou AI Editorial",
  description: "AI-powered article evaluation system for premium editorial standards by Envoyou.",
  metadataBase: new URL("https://eai.envoyou.com"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes(locale as "en" | "id")) {
    notFound();
  }

  // Providing all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clerkAppearance = { baseTheme: dark } as any;

  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html
        lang={locale}
        className={`
          ${dmSerifDisplay.variable}
          ${inter.variable}
          ${jetbrainsMono.variable}
          ${lora.variable}
          h-full antialiased
        `}
        suppressHydrationWarning
      >
        <head>
          <meta name="color-scheme" content="dark light" />
        </head>
        <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
          <NextIntlClientProvider messages={messages}>
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem
              disableTransitionOnChange
            >
              <TooltipProvider>
                {children}
                <Toaster
                  position="bottom-right"
                  richColors
                  toastOptions={{
                    className: "font-sans text-sm",
                  }}
                />
              </TooltipProvider>
            </ThemeProvider>
          </NextIntlClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
