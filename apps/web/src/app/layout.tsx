import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: {
    default: "Nosso Tudo — o sistema operacional da vida familiar",
    template: "%s · Nosso Tudo",
  },
  description:
    "Controle financeiro familiar sem fricção. Registre gastos pelo WhatsApp, concilie faturas automaticamente e entenda suas finanças com um assistente de IA.",
  applicationName: "Nosso Tudo",
  authors: [{ name: "Nosso Tudo" }],
  keywords: ["finanças familiares", "controle financeiro", "WhatsApp", "Pix", "conciliação"],
  openGraph: {
    title: "Nosso Tudo",
    description: "O sistema operacional da vida familiar.",
    type: "website",
    locale: "pt_BR",
  },
};

export const viewport: Viewport = {
  themeColor: "#F7F6F2",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
