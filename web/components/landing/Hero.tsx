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
        Autonomous research, from a single prompt.
      </h1>
      <p className="mt-md max-w-[540px] text-body-md text-body">
        Describe a goal in plain language. A planner proposes hypotheses, a pool
        of agents implements and benchmarks each one in parallel, and you get a
        ranked report of what actually works — every result measured, not claimed.
      </p>
      <div className="mt-xl flex w-full justify-center">
        <InstallSnippet command="python -m autoreduce" />
      </div>
      <Link
        href="/dashboard"
        className="mt-lg inline-flex h-btn items-center rounded-full bg-primary px-[20px] text-button-md font-medium text-canvas active:bg-ink-deep"
      >
        Open the dashboard →
      </Link>
    </section>
  );
}
