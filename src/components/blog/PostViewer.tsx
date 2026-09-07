"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import type { FeedPost } from "@/components/blog/BlogContent";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default function PostViewer({
  post,
  layoutId,
  canEdit,
  onClose,
  onEdit,
  onDelete,
}: {
  post: FeedPost;
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
    if (window.confirm("Delete this post? This can't be undone.")) onDelete();
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
        className="relative flex w-full max-w-2xl flex-col rounded-3xl border border-white/10 bg-[#060d09]/95 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.5)] sm:p-12"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-6 top-6 text-lg text-white/30 transition-colors hover:text-white/70"
        >
          ✕
        </button>

        <h1 className="pr-8 text-2xl font-semibold leading-snug text-white/90 sm:text-3xl">{post.title}</h1>
        <p className="mt-2 text-xs tracking-widest text-white/30">
          {dateFormatter.format(post.createdAt)}
          {post.updatedAt !== post.createdAt && <> · edited {dateFormatter.format(post.updatedAt)}</>}
        </p>

        <p className="mt-6 whitespace-pre-wrap text-base leading-relaxed text-white/75">{post.body}</p>

        {canEdit && (
          <div className="mt-8 flex items-center justify-end gap-3 border-t border-white/10 pt-4 text-sm">
            <button onClick={handleDelete} className="text-white/30 transition-colors hover:text-red-300">
              Delete
            </button>
            <button onClick={onEdit} className="text-white/50 transition-colors hover:text-white/90">
              Edit
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
