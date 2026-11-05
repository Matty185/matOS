import type { Metadata } from "next";
import { Inter, Bebas_Neue } from "next/font/google";
import { QueryProvider } from "@/components/providers/query-provider";
import { ServiceWorkerRegister } from "@/components/providers/service-worker-register";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas-neue",
});

export const metadata: Metadata = {
  title: "MatOS",
  description: "The connected platform for Brazilian Jiu-Jitsu academies and athletes.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", type: "image/png", sizes: "48x48" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: "#0B1B33",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${bebasNeue.variable}`}>
      <body>
        <QueryProvider>{children}</QueryProvider>
        <Toaster position="top-center" />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
