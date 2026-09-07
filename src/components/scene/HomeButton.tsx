"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { getAccountSnapshot, getServerAccountSnapshot, subscribeAccount } from "@/lib/account";
import { getDefaultWordmark, getServerDefaultWordmark, subscribeDefaultWordmark } from "@/lib/wordmark";
import { useSceneTransition } from "@/components/scene/scene-context";
import { FONT_FAMILY_VAR, getSettingsSnapshot } from "@/lib/settings";

// Matches HomeContent's layoutId/transition exactly, so the hero title and
// this button read as the same letters flying between pages. Both read the
// same Account > Homepage text, falling back to the same per-load random word when unset.
const LETTER_TRANSITION = { layout: { duration: 0.9, ease: [0.16, 1, 0.3, 1] as const } };
// While the letters are still mid-flight from the hero title (the shared
// layoutId transition owns their transform), the physics loop below must
// not also write to it — so it holds off touching the DOM until this long
// after mount, comfortably past LETTER_TRANSITION's duration.
const PHYSICS_ENTRY_DELAY_MS = 950;

const BOX_WIDTH = 260;
const BOX_HEIGHT = 64;
const LETTER_BOX = 22;
const LETTER_HALF = LETTER_BOX / 2;
const LETTER_RADIUS = 11;
const HOME_GAP = 20;
const HOME_Y = BOX_HEIGHT / 2;
const MAX_SPEED = 30;
const HOVER_IN_RATE = 6; // 1/seconds — converging into the word reads fast/deliberate
const HOVER_OUT_RATE = 0.8; // releasing back to floaty is a slow, gradual shuffle

// Deterministic pseudo-random per index, so server and client compute the
// same initial layout and hydration never mismatches.
function seeded(i: number, salt: number) {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function isPlainLeftClick(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

type Body = { x: number; y: number; vx: number; vy: number };

function separate(a: Body, b: Body) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  const minDist = LETTER_RADIUS * 2;
  if (dist >= minDist) return;
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;
}

function bounceOffEachOther(a: Body, b: Body) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  const minDist = LETTER_RADIUS * 2;
  if (dist >= minDist) return;
  const nx = dx / dist;
  const ny = dy / dist;
  separate(a, b);
  const relVx = b.vx - a.vx;
  const relVy = b.vy - a.vy;
  const closingSpeed = relVx * nx + relVy * ny;
  if (closingSpeed > 0) return; // already moving apart
  const restitution = 0.9;
  const impulse = (-(1 + restitution) * closingSpeed) / 2;
  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;
}

// A gentle random nudge given to every letter's underlying body the moment
// hover ends, so the slow release reads as "waking up and shuffling off"
// rather than a static position just fading back into view.
function shuffleAwake(bodies: Body[]) {
  for (const b of bodies) {
    b.vx += (Math.random() - 0.5) * 16;
    b.vy += (Math.random() - 0.5) * 12;
  }
}

export default function HomeButton() {
  const { diveTo } = useSceneTransition();
  const account = useSyncExternalStore(subscribeAccount, getAccountSnapshot, getServerAccountSnapshot);
  const defaultWordmark = useSyncExternalStore(subscribeDefaultWordmark, getDefaultWordmark, getServerDefaultWordmark);
  const wordmarkText = account.wordmark || defaultWordmark;
  // Split by code point (not raw .split("")), so a custom wordmark with a
  // multi-byte character doesn't get sliced into broken halves.
  const letters = useMemo(() => Array.from(wordmarkText), [wordmarkText]);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const bodiesRef = useRef<Body[]>([]);
  const homeXRef = useRef<number[]>([]);
  const hoverAmountRef = useRef(0);
  const hoveredRef = useRef(false);

  // Each letter's tidy, converged resting spot, re-derived whenever the
  // wordmark's letter count changes — the incoming shared-layoutId
  // transition needs a real, stable rect to land the flying-in hero letters
  // on, before the physics loop below wakes up and takes over via transform.
  const homeX = useMemo(() => {
    const totalWidth = (letters.length - 1) * HOME_GAP;
    const startX = BOX_WIDTH / 2 - totalWidth / 2;
    return letters.map((_, i) => startX + i * HOME_GAP);
  }, [letters]);

  useEffect(() => {
    homeXRef.current = homeX;

    bodiesRef.current = letters.map((_, i) => ({
      x: LETTER_RADIUS + seeded(i, 0) * (BOX_WIDTH - LETTER_RADIUS * 2),
      y: LETTER_RADIUS + seeded(i, 1) * (BOX_HEIGHT - LETTER_RADIUS * 2),
      vx: (seeded(i, 2) - 0.5) * 20,
      vy: (seeded(i, 3) - 0.5) * 16,
    }));

    for (let pass = 0; pass < 8; pass++) {
      for (let i = 0; i < bodiesRef.current.length; i++) {
        for (let j = i + 1; j < bodiesRef.current.length; j++) {
          separate(bodiesRef.current[i], bodiesRef.current[j]);
        }
      }
    }

    let rafId = 0;
    let last = performance.now();
    let mountTime: number | null = null;
    let baseOffsetCleared = false;
    const homeY = BOX_HEIGHT / 2;

    const tick = (now: number) => {
      if (mountTime === null) mountTime = now;
      const settledIn = now - mountTime > PHYSICS_ENTRY_DELAY_MS;

      // The moment physics takes over, drop the CSS left/top each letter
      // landed on (its handoff target from the hero title) so the physics
      // loop's own translate isn't stacked on top of it, and pin hoverAmount
      // to fully-converged so the very first physics-driven frame draws the
      // letters exactly where they already are — a seamless handoff that
      // then releases into the idle float, same as a normal mouse-leave.
      if (settledIn && !baseOffsetCleared) {
        baseOffsetCleared = true;
        hoverAmountRef.current = 1;
        shuffleAwake(bodiesRef.current);
        for (const el of letterRefs.current) {
          if (el) {
            el.style.left = "0px";
            el.style.top = "0px";
          }
        }
      }

      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;

      const { accent, reducedMotion, wordmarkFont, wordmarkColor, wordmarkWeight } = getSettingsSnapshot();
      const wordmarkFontFamily = FONT_FAMILY_VAR[wordmarkFont];
      const [wr, wg, wb] = wordmarkColor.split(",").map((n) => parseInt(n.trim(), 10) || 0);
      // A pale, mostly-white version of the landing page title's own color -
      // same Settings > (landing page title) Color the hero wordmark shades
      // into, so the hero and this nav button read as the same letters
      // wearing the same look, not just handed off by animation.
      const pr = Math.round(255 + (wr - 255) * 0.22);
      const pg = Math.round(255 + (wg - 255) * 0.22);
      const pb = Math.round(255 + (wb - 255) * 0.22);

      const hoverRate = hoveredRef.current ? HOVER_IN_RATE : HOVER_OUT_RATE;
      hoverAmountRef.current +=
        ((hoveredRef.current ? 1 : 0) - hoverAmountRef.current) * (1 - Math.exp(-hoverRate * dt));
      const hoverT = hoverAmountRef.current;

      const bodies = bodiesRef.current;
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (!reducedMotion) {
          const wanderPhase = Math.floor(now / 900) + i * 7;
          b.vx += (seeded(wanderPhase, 40) - 0.5) * 8 * dt;
          b.vy += (seeded(wanderPhase, 50) - 0.5) * 8 * dt;
        }
        const speed = Math.hypot(b.vx, b.vy);
        if (speed > MAX_SPEED) {
          b.vx = (b.vx / speed) * MAX_SPEED;
          b.vy = (b.vy / speed) * MAX_SPEED;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        if (b.x < LETTER_RADIUS) {
          b.x = LETTER_RADIUS;
          b.vx = Math.abs(b.vx);
        }
        if (b.x > BOX_WIDTH - LETTER_RADIUS) {
          b.x = BOX_WIDTH - LETTER_RADIUS;
          b.vx = -Math.abs(b.vx);
        }
        if (b.y < LETTER_RADIUS) {
          b.y = LETTER_RADIUS;
          b.vy = Math.abs(b.vy);
        }
        if (b.y > BOX_HEIGHT - LETTER_RADIUS) {
          b.y = BOX_HEIGHT - LETTER_RADIUS;
          b.vy = -Math.abs(b.vy);
        }
      }

      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          bounceOffEachOther(bodies[i], bodies[j]);
        }
      }

      for (let i = 0; i < letters.length; i++) {
        const el = letterRefs.current[i];
        if (!el) continue;
        const b = bodies[i];
        const fx = b.x + (homeXRef.current[i] - b.x) * hoverT;
        const fy = b.y + (homeY - b.y) * hoverT;
        const half = LETTER_BOX / 2;
        // The physics simulation keeps running from mount so nothing jumps
        // once it takes over, but it only starts writing to the DOM after
        // the shared layoutId transition (which owns transform until then)
        // has settled.
        if (settledIn) {
          el.style.transform = `translate(${(fx - half).toFixed(1)}px, ${(fy - half).toFixed(1)}px)`;
        }

        const r = Math.round(255 + (pr - 255) * hoverT);
        const g = Math.round(255 + (pg - 255) * hoverT);
        const bch = Math.round(255 + (pb - 255) * hoverT);
        const alpha = (0.7 + 0.3 * hoverT).toFixed(2);
        el.style.color = `rgba(${r}, ${g}, ${bch}, ${alpha})`;
        el.style.fontFamily = wordmarkFontFamily;
        el.style.fontWeight = String(wordmarkWeight);
        el.style.textShadow =
          hoverT > 0.01
            ? `0 0 ${(10 * hoverT).toFixed(1)}px rgba(${accent}, ${(0.85 * hoverT).toFixed(2)}), 0 0 ${(24 * hoverT).toFixed(1)}px rgba(${accent}, ${(0.5 * hoverT).toFixed(2)})`
            : "none";
        el.dataset.accent = accent;
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [letters, homeX]);

  return (
    <Link
      ref={linkRef}
      href="/"
      aria-label={`${wordmarkText} home`}
      onClick={(e) => {
        if (!isPlainLeftClick(e)) return;
        e.preventDefault();
        diveTo("/", e.currentTarget);
      }}
      onMouseEnter={() => {
        hoveredRef.current = true;
      }}
      onMouseLeave={() => {
        hoveredRef.current = false;
        shuffleAwake(bodiesRef.current);
      }}
      onFocus={() => {
        hoveredRef.current = true;
      }}
      onBlur={() => {
        hoveredRef.current = false;
        shuffleAwake(bodiesRef.current);
      }}
      className="fixed left-6 top-6 z-20 block font-semibold sm:text-base"
      style={{ width: BOX_WIDTH, height: BOX_HEIGHT }}
    >
      <span className="relative block h-full w-full">
        {letters.map((letter, i) => (
          <motion.span
            key={i}
            layoutId={`home-letter-${i}`}
            transition={LETTER_TRANSITION}
            ref={(el) => {
              letterRefs.current[i] = el;
            }}
            data-particle-target
            data-accent="48, 210, 120"
            className="absolute flex items-center justify-center text-sm text-white/70 sm:text-base"
            style={{
              width: LETTER_BOX,
              height: LETTER_BOX,
              left: homeX[i] - LETTER_HALF,
              top: HOME_Y - LETTER_HALF,
            }}
          >
            {letter}
          </motion.span>
        ))}
      </span>
    </Link>
  );
}
