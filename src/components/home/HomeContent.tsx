"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import AccountBadge from "@/components/home/AccountBadge";
import { getAccountSnapshot, getServerAccountSnapshot, subscribeAccount } from "@/lib/account";
import { getDefaultWordmark, getServerDefaultWordmark, subscribeDefaultWordmark } from "@/lib/wordmark";
import { useSceneTransition } from "@/components/scene/scene-context";
import { FONT_FAMILY_VAR, getSettingsSnapshot } from "@/lib/settings";

type NavOrb = {
  label: string;
  href: string;
  accent: string;
  delay: string;
  duration: string;
  icon: React.ReactNode;
};

// Material Symbols (Google, Apache-2.0) - outlined 24px, viewBox "0 -960 960 960".
const ICONS = {
  games: (
    <path d="M182-200q-51 0-79-35.5T82-322l42-300q9-60 53.5-99T282-760h396q60 0 104.5 39t53.5 99l42 300q7 51-21 86.5T778-200q-21 0-39-7.5T706-230l-90-90H344l-90 90q-15 15-33 22.5t-39 7.5Zm16-86 114-114h336l114 114q2 2 16 6 11 0 17.5-6.5T800-304l-44-308q-4-29-26-48.5T678-680H282q-30 0-52 19.5T204-612l-44 308q-2 11 4.5 17.5T182-280q2 0 16-6Zm510.5-165.5Q720-463 720-480t-11.5-28.5Q697-520 680-520t-28.5 11.5Q640-497 640-480t11.5 28.5Q663-440 680-440t28.5-11.5Zm-80-120Q640-583 640-600t-11.5-28.5Q617-640 600-640t-28.5 11.5Q560-617 560-600t11.5 28.5Q583-560 600-560t28.5-11.5ZM310-440h60v-70h70v-60h-70v-70h-60v70h-70v60h70v70Zm170-40Z" />
  ),
  blog: (
    <path d="M280-280h280v-80H280v80Zm0-160h400v-80H280v80Zm0-160h400v-80H280v80Zm-80 480q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z" />
  ),
  media: (
    <path d="M360-440h400L622-620l-92 120-62-80-108 140ZM120-120q-33 0-56.5-23.5T40-200v-520h80v520h680v80H120Zm160-160q-33 0-56.5-23.5T200-360v-440q0-33 23.5-56.5T280-880h200l80 80h280q33 0 56.5 23.5T920-720v360q0 33-23.5 56.5T840-280H280Zm0-80h560v-360H527l-80-80H280v440Zm0 0v-440 440Z" />
  ),
} as const;

// Matches HomeButton's letters/layoutId scheme exactly, so framer-motion
// treats the hero title and the nav button as the same letters handed off
// between pages rather than two separate pieces of text. Both read the same
// Account > Homepage text, falling back to the same per-load random word when unset.
const LETTER_TRANSITION = { layout: { duration: 0.9, ease: [0.16, 1, 0.3, 1] as const } };
// The shared layoutId transition owns each letter's transform while it's
// mid-flight from the home button; the idle-float/cursor-repel loop below
// must not fight it, so it holds off until comfortably past that duration.
const FLOAT_ENTRY_DELAY_MS = 950;
const REPEL_REACH = 100;
const INFLUENCE_SMOOTHING_RATE = 9; // 1/seconds — a light spring-like lag rather than an instant snap
const DUST_THRESHOLD = 0.22;
const DUST_INTERVAL_MS = 90;

// Forest/natural palette: emerald (growth), moss teal (water/shade), amber (sunlight through canopy).
const NAV_ORBS: NavOrb[] = [
  { label: "Games", href: "/games", accent: "48, 210, 120", delay: "0s", duration: "6.5s", icon: ICONS.games },
  { label: "Blog", href: "/blog", accent: "40, 128, 255", delay: "-2.1s", duration: "7.2s", icon: ICONS.blog },
  { label: "Media", href: "/media", accent: "240, 176, 42", delay: "-4.4s", duration: "5.8s", icon: ICONS.media },
];

function isPlainLeftClick(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

// Deterministic pseudo-random per letter, so each one's idle drift has its
// own phase/speed without needing real randomness (keeps server/client
// markup identical).
function seeded(i: number, salt: number) {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export default function HomeContent() {
  const { diveTo, getPointer, emitDust } = useSceneTransition();
  const account = useSyncExternalStore(subscribeAccount, getAccountSnapshot, getServerAccountSnapshot);
  const defaultWordmark = useSyncExternalStore(subscribeDefaultWordmark, getDefaultWordmark, getServerDefaultWordmark);
  const wordmarkText = account.wordmark || defaultWordmark;
  // Split by code point (not raw .split("")), so a custom wordmark with a
  // multi-byte character doesn't get sliced into broken halves.
  const wordmark = useMemo(() => Array.from(wordmarkText), [wordmarkText]);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    let rafId = 0;
    let mountTime: number | null = null;
    let last = 0;
    let baseCenters: { x: number; y: number }[] = [];
    const influence = new Array(wordmark.length).fill(0);
    const lastDustAt = new Array(wordmark.length).fill(-Infinity);

    const measure = () => {
      baseCenters = letterRefs.current.map((el) => {
        if (!el) return { x: 0, y: 0 };
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
    };

    const tick = (now: number) => {
      if (mountTime === null) {
        mountTime = now;
        last = now;
      }
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const settledIn = now - mountTime > FLOAT_ENTRY_DELAY_MS;

      // Font, color, and accent tint apply every frame from mount - only the
      // float/repel transform below needs to wait for the incoming layoutId
      // flight (from HomeButton) to finish, since that's the only thing that
      // actually fights over the `transform` property. Gating these on the
      // same delay as the physics made the wordmark visibly snap from its
      // default bold/white look to the user's real font/weight/color a beat
      // after every arrival at "/" - cheap-looking and unnecessary, since
      // none of this touches transform.
      const { accent, wordmarkFont, wordmarkColor, wordmarkWeight } = getSettingsSnapshot();
      const wordmarkFontFamily = FONT_FAMILY_VAR[wordmarkFont];
      for (let i = 0; i < wordmark.length; i++) {
        const el = letterRefs.current[i];
        if (!el) continue;
        el.style.fontFamily = wordmarkFontFamily;
        el.style.fontWeight = String(wordmarkWeight);
        el.style.backgroundImage = `linear-gradient(to bottom, white, rgba(${wordmarkColor}, 0.4))`;
        el.dataset.accent = accent;
      }

      if (settledIn) {
        if (baseCenters.length === 0) measure();
        const t = now / 1000;
        const pointer = getPointer();
        const { reducedMotion } = getSettingsSnapshot();

        for (let i = 0; i < wordmark.length; i++) {
          const el = letterRefs.current[i];
          const base = baseCenters[i];
          if (!el || !base) continue;

          // Gentle ambient bob, out of phase per letter so the word drifts
          // like something adrift in liquid rather than pulsing in unison -
          // skipped under Settings > Reduced motion.
          const floatX = reducedMotion ? 0 : Math.sin(t * (0.45 + seeded(i, 1) * 0.35) + seeded(i, 2) * 10) * 3;
          const floatY = reducedMotion ? 0 : Math.cos(t * (0.35 + seeded(i, 3) * 0.35) + seeded(i, 4) * 10) * 4.5;

          let targetInfluence = 0;
          let nx = 0;
          let ny = 0;
          if (pointer) {
            const dx = base.x - pointer.x;
            const dy = base.y - pointer.y;
            const dist = Math.hypot(dx, dy) || 1;
            if (dist < REPEL_REACH) {
              const proximity = 1 - dist / REPEL_REACH;
              targetInfluence = proximity * proximity;
              nx = dx / dist;
              ny = dy / dist;
            }
          }
          // A light spring-like lag toward the target proximity, rather than
          // snapping — reads as the letter actually being nudged rather
          // than teleporting to a computed offset.
          influence[i] += (targetInfluence - influence[i]) * (1 - Math.exp(-INFLUENCE_SMOOTHING_RATE * dt));
          const glow = influence[i];
          const push = glow * 14;
          const repelX = nx * push;
          const repelY = ny * push;

          el.style.transform = `translate(${(floatX + repelX).toFixed(2)}px, ${(floatY + repelY).toFixed(2)}px) scale(${(1 + glow * 0.06).toFixed(3)})`;
          el.style.filter =
            glow > 0.02 ? `drop-shadow(0 0 ${(4 + glow * 9).toFixed(1)}px rgba(${accent}, ${(glow * 0.55).toFixed(2)}))` : "";

          if (glow > DUST_THRESHOLD && now - lastDustAt[i] > DUST_INTERVAL_MS) {
            lastDustAt[i] = now;
            emitDust(base.x + repelX, base.y + repelY, 1);
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    // The cached centers are viewport coordinates (they're compared against
    // the pointer, which is too), so a scroll invalidates them just as a
    // resize does - on a landscape phone the page really does scroll now.
    const invalidate = () => {
      baseCenters = [];
    };
    window.addEventListener("resize", invalidate);
    window.addEventListener("scroll", invalidate, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("scroll", invalidate);
    };
  }, [getPointer, emitDust, wordmark]);

  return (
    <div className="spatial-page flex flex-col items-center gap-14 px-6 pt-20 text-center sm:pt-28 short-landscape:gap-8 short-landscape:pb-14 short-landscape:pt-12">
      <AccountBadge />
      <div className="flex flex-col items-center gap-4">
        <h1 className="wordmark-text flex items-baseline font-semibold tracking-[0.2em] drop-shadow-[0_0_25px_rgba(48,210,120,0.45)]">
          {wordmark.map((letter, i) => (
            <motion.span
              key={i}
              ref={(el) => {
                letterRefs.current[i] = el;
              }}
              layoutId={`home-letter-${i}`}
              transition={LETTER_TRANSITION}
              data-particle-target
              data-accent="48, 210, 120"
              className="inline-block whitespace-pre bg-gradient-to-b from-white to-emerald-300/45 bg-clip-text text-transparent"
            >
              {letter}
            </motion.span>
          ))}
        </h1>
        <p className="max-w-md text-balance text-sm text-white/50 sm:text-base">
          an evolving space for games, words, and everything in between.
        </p>
      </div>

      <nav className="flex flex-wrap items-center justify-center gap-10 sm:gap-16 short-landscape:gap-8">
        {NAV_ORBS.map((orb) => (
          <Link
            key={orb.label}
            href={orb.href}
            data-particle-target
            data-accent={orb.accent}
            onClick={(e) => {
              if (!isPlainLeftClick(e)) return;
              e.preventDefault();
              diveTo(orb.href, e.currentTarget);
            }}
            className="animate-breathe group relative flex h-32 w-32 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm font-medium tracking-wide text-white/80 backdrop-blur-md transition-transform duration-300 hover:scale-110 hover:text-white sm:h-36 sm:w-36 short-landscape:h-24 short-landscape:w-24"
            style={
              {
                animationDelay: orb.delay,
                animationDuration: orb.duration,
                "--orb-glow": `rgba(${orb.accent}, 0.35)`,
              } as React.CSSProperties
            }
          >
            <span
              className="absolute inset-0 rounded-full opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100"
              style={{ background: `radial-gradient(circle, rgba(${orb.accent}, 0.35), transparent 70%)` }}
            />
            <span className="relative flex flex-col items-center gap-2">
              <svg viewBox="0 -960 960 960" fill="currentColor" className="h-7 w-7 text-white/80 transition-colors duration-300 group-hover:text-white">
                {orb.icon}
              </svg>
              {orb.label}
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
