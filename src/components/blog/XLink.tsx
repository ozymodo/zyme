const ACCENT = "40, 128, 255";
const X_URL = "https://x.com/gazntyno";

export default function XLink() {
  return (
    <a
      href={X_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="@gazntyno on X"
      title="@gazntyno on X"
      data-particle-target
      data-accent={ACCENT}
      className="fixed bottom-8 left-8 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/60 backdrop-blur-md transition-all duration-300 hover:scale-110 hover:border-white/30 hover:text-white"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    </a>
  );
}
