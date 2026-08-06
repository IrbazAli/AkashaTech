import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import Providers from "./Providers";
import AuthUI from "../components/AuthUI";

export const metadata: Metadata = {
  title: "Akasha Relic Tech - AR MVP",
  description: "Month 1 MVP for AR Memorial Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script src="https://cdn.jsdelivr.net/npm/eruda" strategy="beforeInteractive" />
        <Script id="eruda-init" strategy="afterInteractive">
          {`eruda.init();`}
        </Script>
      </head>
      <body>
        <Providers>
          <AuthUI />
          {children}
        </Providers>
      </body>
    </html>
  );
}
