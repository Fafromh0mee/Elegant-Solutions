import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  subsets: ["latin", "thai"],
  weight: ["100", "200", "300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Elegant Solutions - Smart Access Management",
  description: "ระบบจัดการการเข้าถึงห้องประชุมอัจฉริยะ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className={ibmPlexSansThai.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
