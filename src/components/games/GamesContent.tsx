"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import AnimatedTitle from "@/components/common/AnimatedTitle";
import DiscordLink from "@/components/games/DiscordLink";
import FreeroamButton from "@/components/games/FreeroamButton";
import ItchLink from "@/components/games/ItchLink";
import { useSceneTransition } from "@/components/scene/scene-context";

const MICROBYTE_ACCENT = "48, 210, 120";
const PLAYTEST_ACCENT = "214, 66, 30";

function isPlainLeftClick(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

export default function GamesContent() {
  const { diveTo } = useSceneTransition();

  return (
    <div className="spatial-page flex flex-col items-center justify-center gap-10 px-6 py-24 short-landscape:gap-6 short-landscape:py-14">
      <div className="flex flex-col items-center gap-2 text-center">
        <AnimatedTitle
          text="GAMES"
          intensity={0.4}
          accent={MICROBYTE_ACCENT}
          className="text-3xl font-semibold tracking-[0.15em] text-white/90 sm:text-4xl"
        />
        <p className="text-sm text-white/40">Playable worlds, built from scratch.</p>
      </div>

      <Link
        href="/games/microbyte"
        data-particle-target
        data-accent={MICROBYTE_ACCENT}
        onClick={(e) => {
          if (!isPlainLeftClick(e)) return;
          e.preventDefault();
          diveTo("/games/microbyte", e.currentTarget);
        }}
        className="group relative block w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 text-left backdrop-blur-md transition-transform duration-300 hover:scale-[1.02]"
        style={{ "--orb-glow": `rgba(${MICROBYTE_ACCENT}, 0.3)` } as React.CSSProperties}
      >
        <span
          className="pointer-events-none absolute inset-0 opacity-40 blur-2xl transition-opacity duration-300 group-hover:opacity-70"
          style={{
            background: `radial-gradient(circle at 30% 20%, rgba(${MICROBYTE_ACCENT}, 0.35), transparent 60%)`,
          }}
        />
        <div className="relative flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold tracking-wide text-white">microbyte</h2>
            <span
              className="rounded-full border px-3 py-1 text-xs tracking-widest"
              style={{
                borderColor: `rgba(${PLAYTEST_ACCENT}, 0.3)`,
                backgroundColor: `rgba(${PLAYTEST_ACCENT}, 0.1)`,
                color: `rgb(${PLAYTEST_ACCENT})`,
              }}
            >
              Playtest
            </span>
          </div>
          <p className="text-sm leading-relaxed text-white/60">
           play as a tiny organism in a microscopic world. survive, hunt, and multiply in a dynamic ecosystem teeming with life. 
           microbyte is a unique genre blend of rougelite, simulation, and stategy. 
          </p>
          <span className="text-sm font-medium text-emerald-300 transition-colors group-hover:text-emerald-200">
            Play in browser →
          </span>
        </div>
      </Link>

      <FreeroamButton />
      <DiscordLink />
      <ItchLink />
    </div>
  );
}
