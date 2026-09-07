"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { FeedMediaItem } from "@/components/media/MediaContent";

const ACCENT = "240, 176, 42";

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

type Props =
  | { mode: "new"; layoutId: string; onCancel: () => void; onSubmit: (file: File, caption: string) => Promise<void> }
  | { mode: "edit"; item: FeedMediaItem; layoutId: string; onCancel: () => void; onSubmit: (caption: string) => Promise<void> };

export default function MediaEditor(props: Props) {
  const { mode, layoutId, onCancel } = props;
  const [initialCaption] = useState(mode === "edit" ? props.item.caption : "");
  const [caption, setCaption] = useState(initialCaption);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [kind, setKind] = useState<"image" | "video" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const captionRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    autoGrow(captionRef.current);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const dirty = mode === "new" ? file !== null || caption.trim().length > 0 : caption !== initialCaption;
  const canSubmit = mode === "new" ? file !== null && !submitting : !submitting;

  const handleCancel = () => {
    if (dirty) {
      const ok = window.confirm(mode === "new" ? "Discard this upload?" : "Discard unsaved changes?");
      if (!ok) return;
    }
    onCancel();
  };

  const handleFile = (f: File) => {
    if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) {
      setError("Choose an image or video file.");
      return;
    }
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setKind(f.type.startsWith("video/") ? "video" : "image");
    setPreviewUrl(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "new") {
        if (!file) return;
        await props.onSubmit(file, caption);
      } else {
        await props.onSubmit(caption);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (canSubmit) handleSubmit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFile(dropped);
  };

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
        className="relative flex w-full max-w-2xl flex-col rounded-3xl border border-white/10 bg-[#060d09]/95 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.5)] sm:p-8"
      >
        <button
          onClick={handleCancel}
          aria-label="Close"
          className="absolute right-5 top-5 z-10 text-lg text-white/40 transition-colors hover:text-white/80"
        >
          ✕
        </button>

        {mode === "new" ? (
          previewUrl ? (
            <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-black/30">
              {kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="" className="max-h-[50vh] w-full object-contain" />
              ) : (
                <video src={previewUrl} controls className="max-h-[50vh] w-full bg-black" />
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-3 right-3 rounded-full border border-white/15 bg-black/50 px-3 py-1 text-xs text-white/70 backdrop-blur-md transition-colors hover:text-white"
              >
                Change
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 text-white/40 transition-colors hover:border-white/30 hover:text-white/60"
            >
              <span className="text-3xl">+</span>
              <span className="text-sm">Click or drop a photo or video</span>
            </div>
          )
        ) : (
          <div className="flex items-center justify-center overflow-hidden rounded-2xl bg-black/30">
            {props.item.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.item.url} alt="" className="max-h-[50vh] w-full object-contain" />
            ) : (
              <video src={props.item.url} controls className="max-h-[50vh] w-full bg-black" />
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        <textarea
          ref={captionRef}
          value={caption}
          onChange={(e) => {
            setCaption(e.target.value);
            autoGrow(e.target);
          }}
          placeholder="Add a caption…"
          rows={1}
          className="mt-4 resize-none overflow-hidden bg-transparent text-base leading-relaxed text-white/75 placeholder-white/25 outline-none"
        />

        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}

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
            {submitting ? "Saving…" : mode === "new" ? "Post" : "Save"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
