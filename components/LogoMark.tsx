// Bezel + trace: a measurement instrument, not a glyph.
export default function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="1.75" y="1.75" width="16.5" height="16.5" rx="3.5" />
      <path
        d="M4.75 12.25h2L8.5 6.5l2 8 1.5-4.25h3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
