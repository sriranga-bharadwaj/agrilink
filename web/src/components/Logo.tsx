// Leaf mark used in the header; the same shape is the browser-tab icon (src/app/icon.svg).
export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#2f7d43" />
      <path d="M9 23c0-8 5-13 15-14-1 10-6 15-14 15" fill="#dcefdf" />
      <path d="M9 24c3-5 7-9 11-11" stroke="#2f7d43" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}
