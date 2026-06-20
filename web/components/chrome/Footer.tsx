/** footer-section: 1px top hairline, caption-sm body links. */
export function Footer() {
  return (
    <footer className="mt-section border-t border-hairline py-xxl">
      <div className="flex flex-wrap items-center justify-center gap-x-xl gap-y-sm text-caption-sm text-body">
        <a href="https://github.com" className="hover:text-ink">Docs</a>
        <a href="https://github.com" className="hover:text-ink">GitHub</a>
        <a href="https://github.com" className="hover:text-ink">API</a>
        <a href="https://github.com" className="hover:text-ink">Privacy</a>
        <span className="text-mute">© 2026 autoreduce</span>
      </div>
    </footer>
  );
}
