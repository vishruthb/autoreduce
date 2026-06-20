import type { Metadata, Viewport } from "next";
import { Nunito, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TopBar } from "@/components/chrome/TopBar";
import { ConnectionProvider } from "@/lib/connection";

// SF Pro Rounded is Apple-only; per DESIGN.md the open substitute for the
// rounded display face is Nunito, system sans carries body, JetBrains Mono code.
const display = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "autoreduce — autonomous research",
  description:
    "Describe a goal in plain language. A planner proposes hypotheses, a pool of " +
    "agents implements and benchmarks each one, and you get a ranked, verified " +
    "report of what actually works.",
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="bg-canvas text-ink antialiased">
        <ConnectionProvider>
          <TopBar />
          {children}
        </ConnectionProvider>
      </body>
    </html>
  );
}
