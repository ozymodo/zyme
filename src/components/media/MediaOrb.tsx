"use client";

import { motion } from "framer-motion";
import type { MouseEvent } from "react";
import type { FeedMediaItem } from "@/components/media/MediaContent";
import { clampedAxis, driftParams, edgeMargin, gridPosition, hashSeed, seeded } from "@/lib/orbLayout";
import { useSceneTransition } from "@/components/scene/scene-context";

const ACCENT = "240, 176, 42";

export default function MediaOrb({
  item,
  index,
  total,
  onOpen,
}: {
  item: FeedMediaItem;
  index: number;
  total: number;
  onOpen: () => void;
}) {
  const seed = hashSeed(item.id);
  const { left, top } = gridPosition(seed, index, total);
  const size = 104 + seeded(seed, 11) * 36;
  const { driftX, driftY, duration, delay } = driftParams(seed);
  const { burstAt } = useSceneTransition();

  const handleOpen = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    burstAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
    onOpen();
  };

  return (
    <motion.button
      layoutId={`media-${item.id}`}
      onClick={handleOpen}
      data-particle-target
      data-accent={ACCENT}
      aria-label={item.caption || (item.kind === "video" ? "Video" : "Photo")}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.4 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      className="animate-orb group absolute overflow-hidden rounded-full border border-white/15 bg-white/5 backdrop-blur-md transition-[border-color] duration-300 hover:border-white/30"
      style={
        {
          left: clampedAxis(left, edgeMargin(size, driftX)),
          top: clampedAxis(top, edgeMargin(size, driftY)),
          width: size,
          height: size,
          translate: "-50% -50%",
          "--orb-glow": `rgba(${ACCENT}, 0.3)`,
          "--orb-breathe-duration": `${duration}s`,
          "--orb-drift-duration": `${duration * 1.4}s`,
          "--orb-breathe-delay": `${delay}s`,
          "--orb-drift-delay": `${delay}s`,
          "--drift-x": `${driftX}px`,
          "--drift-y": `${driftY}px`,
        } as React.CSSProperties
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.posterUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />

      {item.kind === "video" && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-3.5 w-3.5 fill-white/90">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      )}

      <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/10" />
    </motion.button>
  );
}
