import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { RegisterServiceWorker } from "@/components/register-sw";
import { NetworkProvider } from "@/lib/store";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "6IX DEGREES — Everyone is closer than you think",
  description: "Remember the people you meet and see how your network connects. Remember. Connect. Discover.",
  applicationName: "6IX DEGREES",
  appleWebApp: { capable: true, title: "6IX", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#09090B", viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <NetworkProvider>
          <AppShell>{children}</AppShell>
          <RegisterServiceWorker />
        </NetworkProvider>
      </body>
    </html>
  );
}
