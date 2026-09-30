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
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('jobradar-theme');document.documentElement.dataset.theme=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}catch{document.documentElement.dataset.theme='light'}` }} /></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
