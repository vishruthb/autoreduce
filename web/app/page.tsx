import { Hero } from "@/components/landing/Hero";
import { TerminalPreview } from "@/components/landing/TerminalPreview";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-56px)] max-w-content flex-col px-lg">
      <main className="flex flex-1 flex-col justify-center gap-xxl py-xl">
        <Hero />
        <TerminalPreview />
      </main>
      <footer className="py-lg text-center text-caption-sm text-mute">
        © 2026 autoreduce
      </footer>
    </div>
  );
}
