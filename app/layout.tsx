import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Star Tree — Plattnericus",
  description:
    "A floating island and a low-poly tree that grows with every GitHub star.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
