import type { Metadata } from "next";
import { Orbitron, Inter } from "next/font/google";
import "./globals.css";

// Title font — geometric angular, like the Aquire reference
const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  weight: ["700", "800", "900"],
  display: "swap",
});

// Body / UI font — clean modern neutral
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
    <html lang="en" className={`${orbitron.variable} ${inter.variable}`}>
      <body style={{ height: "100%", overflow: "hidden" }}>{children}</body>
    </html>
  );
}
