"use client";

import { useEffect, useMemo, useRef } from "react";
import { useSceneTransition } from "@/components/scene/scene-context";
import { getSettingsSnapshot } from "@/lib/settings";

// Same idle-float/cursor-repel effect as the homepage hero wordmark
// (HomeContent), factored out for reuse on the other pages' own titles at a
// lower `intensity` - toned down on purpose, so none of them out-glow the
// Home button as the more inviting thing to click.
const REPEL_REACH = 100;
const INFLUENCE_SMOOTHING_RATE = 9; // 1/seconds — a light spring-like lag rather than an instant snap
const FLOAT_X_AMPLITUDE = 3;
const FLOAT_Y_AMPLITUDE = 4.5;
const REPEL_PUSH = 14;
const GLOW_NEAR_PX = 4;
const GLOW_FAR_PX = 9;

function seeded(i: number, salt: number) {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export default function AnimatedTitle({
  text,
  className = "",
  intensity = 1,
  accent,
}: {
  text: string;
  className?: string;
  /** Scales the float amplitude, repel push, and glow together - 1 is the homepage's own strength. */
  intensity?: number;
  /** "r, g, b" - this title's own color for its glow and the cursor/target
   *  constellation lines (SceneProvider draws those for any
   *  `data-particle-target` element), so each page's title lines read in
   *  that page's color rather than the site-wide accent setting. */
  accent: string;
}) {
  const { getPointer } = useSceneTransition();
  const letters = useMemo(() => Array.from(text), [text]);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    let rafId = 0;
    let baseCenters: { x: number; y: number }[] = [];
    const influence = new Array(letters.length).fill(0);

    const measure = () => {
      baseCenters = letterRefs.current.map((el) => {
        if (!el) return { x: 0, y: 0 };
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
    };

    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      if (baseCenters.length === 0) measure();
      const t = now / 1000;
      const pointer = getPointer();
      const { reducedMotion } = getSettingsSnapshot();

      for (let i = 0; i < letters.length; i++) {
        const el = letterRefs.current[i];
        const base = baseCenters[i];
        if (!el || !base) continue;

        const floatX = reducedMotion ? 0 : Math.sin(t * (0.45 + seeded(i, 1) * 0.35) + seeded(i, 2) * 10) * FLOAT_X_AMPLITUDE * intensity;
        const floatY = reducedMotion ? 0 : Math.cos(t * (0.35 + seeded(i, 3) * 0.35) + seeded(i, 4) * 10) * FLOAT_Y_AMPLITUDE * intensity;

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
        influence[i] += (targetInfluence - influence[i]) * (1 - Math.exp(-INFLUENCE_SMOOTHING_RATE * dt));
        const glow = influence[i] * intensity;
        const push = glow * REPEL_PUSH;
        const repelX = nx * push;
        const repelY = ny * push;

        el.style.transform = `translate(${(floatX + repelX).toFixed(2)}px, ${(floatY + repelY).toFixed(2)}px)`;
        el.style.filter =
          glow > 0.02
            ? `drop-shadow(0 0 ${(GLOW_NEAR_PX + glow * GLOW_FAR_PX).toFixed(1)}px rgba(${accent}, ${(glow * 0.55).toFixed(2)}))`
            : "";
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
  }, [getPointer, letters, intensity, accent]);

  return (
    <h1 className={className}>
      {letters.map((letter, i) => (
        <span
          key={i}
          ref={(el) => {
            letterRefs.current[i] = el;
          }}
          data-particle-target
          data-accent={accent}
          className="inline-block whitespace-pre"
        >
          {letter}
        </span>
      ))}
    </h1>
  );
}
