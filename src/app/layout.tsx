import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Botica Huánuco", template: "%s · Botica Huánuco" },
  description: "Sistema de ventas, lotes y vencimientos de Botica Huánuco",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0b4f45", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE" className={inter.variable}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
