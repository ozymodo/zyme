"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { FeedPost } from "@/components/blog/BlogContent";

const ACCENT = "40, 128, 255";

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export default function PostEditor({
  mode,
  post,
  layoutId,
  onCancel,
  onSubmit,
}: {
  mode: "new" | "edit";
  post?: FeedPost;
  layoutId: string;
  onCancel: () => void;
  onSubmit: (title: string, body: string) => void | Promise<void>;
}) {
  const [initial] = useState(() => ({ title: post?.title ?? "", body: post?.body ?? "" }));
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const dirty = title !== initial.title || body !== initial.body;
  const canSubmit = title.trim().length > 0 || body.trim().length > 0;

  useEffect(() => {
    autoGrow(titleRef.current);
    autoGrow(bodyRef.current);
    if (mode === "new") {
      titleRef.current?.focus();
    } else {
      const el = bodyRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }
    // Mount-only: focuses the right field for a fresh post vs. an edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = () => {
    if (dirty && canSubmit) {
      const ok = window.confirm(mode === "new" ? "Discard this post?" : "Discard unsaved changes?");
      if (!ok) return;
    }
    onCancel();
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(title, body);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <motion.div
      className="fixed inset-0 z-50 flex cursor-auto items-start justify-center overflow-y-auto overscroll-contain bg-[#020403]/85 px-4 py-10 backdrop-blur-sm sm:py-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleCancel}
    >
      <motion.div
        layoutId={layoutId}
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-2xl flex-col rounded-3xl border border-white/10 bg-[#060d09]/95 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.5)] sm:p-12"
      >
        <button
          onClick={handleCancel}
          aria-label="Close"
          className="absolute right-6 top-6 text-lg text-white/30 transition-colors hover:text-white/70"
        >
          ✕
        </button>

        <textarea
          ref={titleRef}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            autoGrow(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              bodyRef.current?.focus();
            }
          }}
          placeholder="Untitled"
          rows={1}
          className="resize-none overflow-hidden bg-transparent pr-8 text-2xl font-semibold leading-snug text-white/90 placeholder-white/25 outline-none sm:text-3xl"
        />

        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            autoGrow(e.target);
          }}
          placeholder="Start writing…"
          rows={1}
          className="mt-4 min-h-[40vh] resize-none overflow-hidden bg-transparent text-base leading-relaxed text-white/75 placeholder-white/25 outline-none"
        />

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/10 pt-4 text-xs text-white/30">
          <span>Esc to close · ⌘Enter to post</span>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="shrink-0 rounded-full border px-5 py-1.5 text-sm font-medium tracking-wide transition hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-30"
            style={{
              borderColor: `rgba(${ACCENT}, 0.35)`,
              backgroundColor: `rgba(${ACCENT}, 0.12)`,
              color: `rgb(${ACCENT})`,
            }}
          >
            {mode === "new" ? "Post" : "Save"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
