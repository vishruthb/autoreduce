import Link from "next/link";

/** footer-section: 1px top hairline, caption-sm body links. */
export function Footer() {
  return (
    <footer className="mt-section border-t border-hairline py-xxl">
      <div className="flex flex-wrap items-center justify-center gap-x-xl gap-y-sm text-caption-sm text-body">
        <Link href="/how-it-works" className="hover:text-ink">Docs</Link>
        <Link href="/case-studies" className="hover:text-ink">Case studies</Link>
        <Link href="/dashboard" className="hover:text-ink">Dashboard</Link>
        <a
          href="https://github.com/vishruthb/autoreduce"
          target="_blank"
          rel="noreferrer"
          className="hover:text-ink"
        >
          GitHub
        </a>
        <span className="text-mute">© 2026 autoreduce</span>
      </div>
    </footer>
  );
}
