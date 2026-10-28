import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Digi!HME · Sistema para boticas", template: "%s · Digi!HME" },
  description: "Digi!HME: ventas, lotes, vencimientos, caja e inventario para boticas y farmacias",
  applicationName: "Digi!HME",
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
