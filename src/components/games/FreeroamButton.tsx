"use client";

import { useSceneTransition } from "@/components/scene/scene-context";

// Matches the Games page's own accent (GamesContent/MicrobytePlayer).
const ACCENT = "48, 210, 120";

export default function FreeroamButton() {
  const { enterFreeroam } = useSceneTransition();

  return (
    <button
      type="button"
      onClick={() => enterFreeroam()}
      data-particle-target
      data-accent={ACCENT}
      className="fixed bottom-8 right-8 z-20 flex h-14 items-center gap-2.5 rounded-full border border-white/15 bg-white/5 px-6 text-sm font-medium tracking-wide text-white/80 backdrop-blur-md transition-transform duration-300 hover:scale-105 hover:text-white"
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: `rgb(${ACCENT})`, boxShadow: `0 0 8px rgba(${ACCENT}, 0.8)` }}
      />
      Freeroam
    </button>
  );
}
