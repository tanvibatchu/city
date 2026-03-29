import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CityScapes: Visualize Your City's Future",
  description:
    "Explore AI-powered urban simulations of Kitchener-Waterloo and beyond with immersive 3D Mapbox visuals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body style={{ height: "100%", overflow: "hidden" }}>{children}</body>
    </html>
  );
}
