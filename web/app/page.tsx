import Link from "next/link";
import { Hero } from "@/components/landing/Hero";
import { TerminalPreview } from "@/components/landing/TerminalPreview";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-56px)] max-w-dash flex-col px-lg">
      <main className="flex flex-1 flex-col justify-center gap-xxl py-xl">
        <Hero />
        <TerminalPreview />
      </main>
      <footer className="flex flex-wrap items-center justify-center gap-x-xl gap-y-sm py-lg text-caption-sm text-body">
        <Link href="/how-it-works" className="hover:text-ink">Docs</Link>
        <Link href="/case-studies" className="hover:text-ink">Case studies</Link>
        <a
          href="https://github.com/vishruthb/autoreduce"
          target="_blank"
          rel="noreferrer"
          className="hover:text-ink"
        >
          GitHub
        </a>
        <span className="text-mute">© 2026 autoreduce</span>
      </footer>
    </div>
  );
}
