import Link from "next/link";
import { Mascot } from "@/components/chrome/Mascot";
import { InstallSnippet } from "./InstallSnippet";

export function Hero() {
  return (
    <section className="flex flex-col items-center text-center">
      <div className="text-ink">
        <Mascot size={96} />
      </div>
      <h1 className="mt-xl text-display-xl text-ink">
        The easiest way to search for better experiments.
      </h1>
      <p className="mt-md max-w-[520px] text-body-md text-body">
        One planner, eight workers, one ranked table. Point it at a number and
        watch it climb.
      </p>
      <div className="mt-xl flex w-full justify-center">
        <InstallSnippet command="python -m autoreduce" />
      </div>
      <Link
        href="/dashboard"
        className="mt-lg inline-flex h-btn items-center rounded-full bg-primary px-[20px] text-button-md font-medium text-on-dark active:bg-ink-deep"
      >
        Open the dashboard →
      </Link>
    </section>
  );
}
