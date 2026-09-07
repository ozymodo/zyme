"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import type { FocusEvent, MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useSceneTransition } from "@/components/scene/scene-context";

type SubAction = {
  label: string;
  href: string;
  accent: string;
};

// Placeholder destinations for now — more sub-buttons will land here later.
const SUB_ACTIONS: SubAction[] = [
  { label: "Settings", href: "/settings", accent: "150, 165, 215" },
  { label: "Account", href: "/account", accent: "205, 150, 235" },
];

// Sub-buttons stay open briefly after the pointer leaves so crossing the gap
// between the button and its menu doesn't close it mid-hop.
const CLOSE_DELAY_MS = 150;

function isPlainLeftClick(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

export default function UtilityButton({ hidden = false }: { hidden?: boolean }) {
  const { diveTo } = useSceneTransition();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // A page hiding this (a post/media viewer or editor covering the screen)
  // should also close any open submenu, so it doesn't reappear already open
  // the moment the button fades back in.
  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const openMenu = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  // Touch devices have no hover, so the button needs its own tap-to-toggle -
  // and since there's no mouseleave to close it again, a tap anywhere else
  // on the page dismisses it too, once open.
  const toggleMenu = () => {
    clearCloseTimer();
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  const onBlurCapture = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) scheduleClose();
  };

  return (
    <div
      ref={containerRef}
      className={`fixed right-6 top-6 z-20 flex flex-col items-end gap-3 transition-opacity duration-300 ${
        hidden ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
      onFocus={openMenu}
      onBlur={onBlurCapture}
    >
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={toggleMenu}
        data-particle-target
        data-accent="190, 195, 205"
        className="relative flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-medium tracking-wide text-white/80 backdrop-blur-md transition-transform duration-300 hover:scale-105 hover:text-white"
      >
        Utility
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-end gap-2"
          >
            {SUB_ACTIONS.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                data-particle-target
                data-accent={action.accent}
                onClick={(e) => {
                  if (!isPlainLeftClick(e)) return;
                  e.preventDefault();
                  setOpen(false);
                  diveTo(action.href, e.currentTarget);
                }}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-xs font-medium tracking-wide text-white/70 backdrop-blur-md transition-colors duration-200 hover:border-white/25 hover:bg-white/10 hover:text-white"
              >
                {action.label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
