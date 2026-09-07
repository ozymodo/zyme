const ACCENT = "240, 176, 42";

const LINKS = [
  {
    label: "@digicule on YouTube",
    href: "https://www.youtube.com/@digicule",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
];

export default function SocialLinks() {
  return (
    <div className="fixed bottom-8 left-8 z-20 flex gap-3">
      {LINKS.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.label}
          title={link.label}
          data-particle-target
          data-accent={ACCENT}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/60 backdrop-blur-md transition-all duration-300 hover:scale-110 hover:border-white/30 hover:text-white"
        >
          {link.icon}
        </a>
      ))}
    </div>
  );
}
