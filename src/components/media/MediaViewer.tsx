"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import type { FeedMediaItem } from "@/components/media/MediaContent";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default function MediaViewer({
  item,
  layoutId,
  canEdit,
  onClose,
  onEdit,
  onDelete,
}: {
  item: FeedMediaItem;
  layoutId: string;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleDelete = () => {
    if (window.confirm("Delete this media? This can't be undone.")) onDelete();
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex cursor-auto items-start justify-center overflow-y-auto overscroll-contain bg-[#020403]/85 px-4 py-10 backdrop-blur-sm sm:py-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        layoutId={layoutId}
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-2xl flex-col rounded-3xl border border-white/10 bg-[#060d09]/95 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.5)] sm:p-8"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-5 top-5 z-10 text-lg text-white/40 transition-colors hover:text-white/80"
        >
          ✕
        </button>

        <div className="flex items-center justify-center overflow-hidden rounded-2xl bg-black/30">
          {item.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt={item.caption} className="max-h-[65vh] w-full object-contain" />
          ) : (
            <video src={item.url} controls className="max-h-[65vh] w-full bg-black" />
          )}
        </div>

        <p className="mt-5 text-base leading-relaxed text-white/80">
          {item.caption || <span className="italic text-white/30">No caption</span>}
        </p>
        <p className="mt-2 text-xs tracking-widest text-white/30">
          {dateFormatter.format(item.createdAt)}
          {item.updatedAt !== item.createdAt && <> · edited {dateFormatter.format(item.updatedAt)}</>}
        </p>

        {canEdit && (
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/10 pt-4 text-sm">
            <button onClick={handleDelete} className="text-white/30 transition-colors hover:text-red-300">
              Delete
            </button>
            <button onClick={onEdit} className="text-white/50 transition-colors hover:text-white/90">
              Edit caption
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
