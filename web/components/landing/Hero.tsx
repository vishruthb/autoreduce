import Link from "next/link";
import { Mascot } from "@/components/chrome/Mascot";

export function Hero() {
  return (
    <section className="flex flex-col items-center text-center">
      <div className="text-ink">
        <Mascot size={96} />
      </div>
      <p className="mt-lg font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
        Autoreduce
      </p>
      <h1 className="mt-md max-w-[620px] text-heading-lg text-ink">
        Distributed autoresearch.
      </h1>
      <p className="mt-md max-w-[720px] text-body-md text-body">
        Autoreduce uses coding agents, sealed benchmarks, and elastic GPU scheduling to search over
        algorithms, batching regimes, precision formats, and multi-GPU execution plans.
      </p>
      <p className="mt-md max-w-[620px] text-heading-sm text-ink">
        Most agent research loops ask what to try next. Autoreduce also asks where that idea
        actually works.
      </p>
      <div className="mt-xl flex flex-wrap justify-center gap-sm">
        <Link
          href="/dashboard"
          className="inline-flex h-btn items-center rounded-full bg-primary px-[20px] text-button-md font-medium text-canvas active:bg-ink-deep"
        >
          Open dashboard
        </Link>
        <a
          href="https://github.com/vishruthb/autoreduce"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-btn items-center rounded-full border border-hairline-strong px-[20px] text-button-md font-medium text-ink hover:bg-surface-soft"
        >
          GitHub
        </a>
        <Link
          href="/how-it-works"
          className="inline-flex h-btn items-center rounded-full border border-hairline-strong px-[20px] text-button-md font-medium text-ink hover:bg-surface-soft"
        >
          Docs
        </Link>
      </div>
    </section>
  );
}
