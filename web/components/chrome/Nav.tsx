import Link from "next/link";
import { Mascot } from "./Mascot";

/** primary-nav: 56px, flat, mascot + wordmark + links + the single black CTA. */
export function Nav() {
  return (
    <nav className="flex h-14 items-center justify-between">
      <Link href="/" className="flex items-center gap-sm text-ink">
        <Mascot size={26} />
        <span className="text-body-strong">autoreduce</span>
      </Link>
      <div className="flex items-center gap-xl">
        <div className="hidden items-center gap-xl text-body-sm-strong text-ink sm:flex">
          <a href="https://github.com" className="hover:text-body">
            Docs
          </a>
          <a href="https://github.com" className="hover:text-body">
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
    </nav>
  );
}
