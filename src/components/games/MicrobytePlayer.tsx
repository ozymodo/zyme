"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { awardMicrobyteMinute } from "@/lib/account";

const ACCENT = "48, 210, 120";
const PLAYTIME_TICK_MS = 60_000;

export default function MicrobytePlayer() {
  const [loaded, setLoaded] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  // iOS Safari has no Fullscreen API for anything but a bare <video> - no
  // requestFullscreen on the iframe, no vendor-prefixed escape hatch. This
  // is the fallback for that case (and anywhere else the real API fails):
  // a fixed, full-viewport CSS overlay with its own exit button, since
  // there's neither native chrome nor an Escape key to back out with.
  const [fakeFullscreen, setFakeFullscreen] = useState(false);
  const isFullscreen = nativeFullscreen || fakeFullscreen;

  useEffect(() => {
    const onFullscreenChange = () => setNativeFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (isFullscreen) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      setFakeFullscreen(false);
      return;
    }
    const el = containerRef.current;
    if (el && document.fullscreenEnabled) {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        // Falls through to the CSS overlay below.
      }
    }
    setFakeFullscreen(true);
  };

  // Counts "on this page with the game loaded" as played time - there's no
  // reach into the iframe's own state across the boundary, but XP ticks are
  // rate-limited to one per minute anyway, so this is a reasonable proxy.
  useEffect(() => {
    if (!loaded) return;
    const interval = setInterval(awardMicrobyteMinute, PLAYTIME_TICK_MS);
    return () => clearInterval(interval);
  }, [loaded]);

  // The iframe ships with no `src` in the server-rendered markup and gets
  // one assigned here instead. If `src` were set from the first render, the
  // browser (same-origin, fast local asset) can finish loading and fire the
  // iframe's one-shot `load` event before React finishes hydrating and
  // attaches the onLoad listener below — silently losing that event forever.
  // Assigning `.src` imperatively, after mount, guarantees the listener is
  // already attached before the navigation it's supposed to catch can start.
  useEffect(() => {
    if (frameRef.current) {
      // Next's basePath rewriting only reaches next/link, next/navigation,
      // and its own bundled asset URLs - not a plain string assigned to an
      // iframe's src, so the GitHub Pages subpath has to be prefixed by hand.
      frameRef.current.src = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/games/microbyte/index.html`;
    }
  }, []);

  return (
    <div className="scroll-page relative flex h-dvh touch-pan-y flex-col items-center gap-8 overflow-y-auto px-6 py-24 short-landscape:gap-6 short-landscape:py-12">
      <div
        className="pointer-events-none absolute top-24 h-72 w-72 rounded-full opacity-25 blur-3xl"
        style={{ background: `radial-gradient(circle, rgba(${ACCENT}, 0.5), transparent 70%)` }}
      />
      <div className="relative flex w-full max-w-4xl items-center justify-between">
        <Link href="/games" className="text-sm text-white/40 transition-colors hover:text-white/80">
          ← Back to Games
        </Link>
        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs tracking-widest text-emerald-300">
          Indie
        </span>
      </div>

      <div className="relative flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-semibold tracking-wide text-white">Microbyte</h1>
        <p className="max-w-xl text-sm leading-relaxed text-white/60">
          microbyte is still in development expect improvements to mechanics, visuals, and performance over time. play as a tiny organism in a microscopic world. survive, hunt, and multiply in a dynamic ecosystem teeming with life. microbyte is a unique genre blend of rougelite, simulation, and stategy.
        </p>
      </div>

      <div
        ref={containerRef}
        className={`flex items-center justify-center overflow-hidden bg-black ${
          isFullscreen
            ? "fixed inset-0 z-50"
            : "relative aspect-video w-full max-w-4xl rounded-2xl border border-emerald-400/20"
        }`}
      >
        {!loaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400/20 border-t-emerald-400" />
            <p className="text-sm text-white/40">Loading Microbyte…</p>
          </div>
        )}
        <iframe
          ref={frameRef}
          title="Microbyte"
          className="h-full w-full border-0"
          allow="autoplay; fullscreen; gamepad"
          allowFullScreen
          onLoad={() => setLoaded(true)}
        />
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          className="absolute right-3 top-3 z-10 rounded-full border border-white/15 bg-black/50 px-3 py-1 text-xs text-white/70 backdrop-blur-sm transition-colors hover:border-emerald-400/30 hover:text-white"
        >
          {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </div>
    </div>
  );
}
