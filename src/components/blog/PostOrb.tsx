"use client";

import { motion } from "framer-motion";
import type { MouseEvent } from "react";
import type { FeedPost } from "@/components/blog/BlogContent";
import { clampedAxis, driftParams, edgeMargin, gridPosition, hashSeed } from "@/lib/orbLayout";
import { useSceneTransition } from "@/components/scene/scene-context";

const ACCENT = "40, 128, 255";

export function orbLayout(post: FeedPost, index: number, total: number) {
  const seed = hashSeed(post.id);
  const { left, top } = gridPosition(seed, index, total);
  const titleLength = post.title.trim().length || 1;
  // Sized off the title, not the body - a longer title gets a bigger bubble
  // (and a slightly smaller font below) so the whole thing fits without
  // truncating. Square-root growth keeps a very long title from ballooning
  // the bubble linearly.
  const size = Math.min(190, Math.max(92, 78 + Math.sqrt(titleLength) * 15));
  const fontSize = Math.max(10, Math.min(15, 16 - Math.sqrt(titleLength) * 0.7));
  const { driftX, driftY, duration, delay } = driftParams(seed);
  return { left, top, size, fontSize, driftX, driftY, duration, delay };
}

export default function PostOrb({
  post,
  index,
  total,
  onOpen,
}: {
  post: FeedPost;
  index: number;
  total: number;
  onOpen: () => void;
}) {
  const { left, top, size, fontSize, driftX, driftY, duration, delay } = orbLayout(post, index, total);
  const { burstAt } = useSceneTransition();

  const handleOpen = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    burstAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
    onOpen();
  };

  return (
    <motion.button
      layoutId={`post-${post.id}`}
      onClick={handleOpen}
      data-particle-target
      data-accent={ACCENT}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.4 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      className="animate-orb group absolute flex items-center justify-center rounded-full border border-white/15 bg-white/5 p-3 text-center backdrop-blur-md transition-[border-color] duration-300 hover:border-white/30"
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
      <span
        className="pointer-events-none absolute inset-0 rounded-full opacity-50 blur-xl transition-opacity duration-300 group-hover:opacity-90"
        style={{ background: `radial-gradient(circle, rgba(${ACCENT}, 0.35), transparent 70%)` }}
      />
      <span
        className="relative max-w-[80%] break-words font-medium leading-snug text-white/80"
        style={{ fontSize }}
      >
        {post.title}
      </span>
    </motion.button>
  );
}
