import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JobRadar",
  description: "Discover fresh Bengaluru and Hyderabad jobs, rank the best matches, and apply early.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
