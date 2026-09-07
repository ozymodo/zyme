export default function ComingSoon({
  title,
  tagline,
  accent = "48, 210, 120",
}: {
  title: string;
  tagline: string;
  accent?: string;
}) {
  return (
    <div className="spatial-page relative flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div
        className="pointer-events-none absolute h-72 w-72 rounded-full opacity-30 blur-3xl"
        style={{ background: `radial-gradient(circle, rgba(${accent}, 0.5), transparent 70%)` }}
      />
      <h1 className="relative text-3xl font-semibold tracking-[0.15em] text-white/90 sm:text-4xl">{title}</h1>
      <p className="relative max-w-md text-sm text-white/40">{tagline}</p>
    </div>
  );
}
