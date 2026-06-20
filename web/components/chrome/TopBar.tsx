"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mascot } from "./Mascot";
import { useConnection } from "@/lib/connection";

function LiveIndicator() {
  const { connection } = useConnection();
  const live = connection === "open";
  const label =
    connection === "open"
      ? "live"
      : connection === "reconnecting"
        ? "reconnecting…"
        : "connecting…";
  return (
    <span className="flex items-center gap-sm text-body-sm text-body">
      <span
        className={`inline-block h-[7px] w-[7px] rounded-full ${
          live ? "dot-running bg-term-green" : "bg-term-red"
        }`}
      />
      {label}
    </span>
  );
}

/**
 * Shared nav, mounted in the root layout so it persists across navigation.
 * Its content column animates from the landing width (720px) to the dashboard
 * width (1120px) when you move to /dashboard — a smooth max-width transition.
 */
export function TopBar() {
  const pathname = usePathname();
  const onDashboard = pathname?.startsWith("/dashboard") ?? false;

  return (
    <header className="w-full">
      <div
        className={`mx-auto px-lg transition-[max-width] duration-500 ease-in-out ${
          onDashboard ? "max-w-dash" : "max-w-content"
        }`}
      >
        <nav className="flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-sm text-ink">
            <Mascot size={26} />
            <span className="text-body-strong">autoreduce</span>
          </Link>
          {onDashboard ? (
            <LiveIndicator />
          ) : (
            <div className="flex items-center gap-xl">
              <div className="hidden items-center gap-xl text-body-sm-strong text-ink sm:flex">
                <Link href="/how-it-works" className="hover:text-body">
                  How it works
                </Link>
                <a
                  href="https://github.com/vishruthb/autoreduce"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-body"
                >
                  GitHub
                </a>
              </div>
              <Link
                href="/dashboard"
                className="inline-flex h-btn items-center rounded-full bg-primary px-[20px] text-button-md font-medium text-canvas active:bg-ink-deep"
              >
                Open dashboard →
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
