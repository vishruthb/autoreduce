import { CopyButton } from "@/components/ui/CopyButton";

/** The signature install pill — surface-soft, rounded-full, code-md, copy icon. */
export function InstallSnippet({ command }: { command: string }) {
  return (
    <div className="inline-flex h-snippet w-full max-w-[440px] items-center justify-between rounded-full bg-surface-soft px-[20px] font-mono text-code-md text-ink">
      <span className="truncate">{command}</span>
      <CopyButton value={command} />
    </div>
  );
}
