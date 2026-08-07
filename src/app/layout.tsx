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
      </head>
      <body>
        <Script src="https://cdn.jsdelivr.net/npm/eruda" />
        <Script id="eruda-init">
          {`eruda.init();`}
        </Script>
        <Providers>
          <AuthUI />
          {children}
        </Providers>
      </body>
    </html>
  );
}
