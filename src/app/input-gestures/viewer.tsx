"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutGrid, Rows3, X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Image = {
  name: string;
  src: string;
  width: number;
  height: number;
};

const STORAGE_KEY = "input-gestures.view";

export default function Viewer({
  images,
  notes,
}: {
  images: Image[];
  notes: Record<string, string>;
}) {
  const [list, setList] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    try {
      setList(localStorage.getItem(STORAGE_KEY) === "list");
    } catch {}
  }, []);

  function toggle(next: boolean) {
    setList(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "list" : "grid");
    } catch {}
  }

  const close = useCallback(() => {
    dialogRef.current?.close();
    setActive(null);
  }, []);

  useEffect(() => {
    if (active === null) return;
    const previousOverflow = document.body.style.overflow;
    dialogRef.current?.showModal();
    document.body.style.overflow = "hidden";
    // Handle Escape before a thumbnail tooltip can consume it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [active, close]);

  const activeImage = active !== null ? images[active] : null;

  function frame(img: Image, i: number, className?: string) {
    const note = notes[img.name];
    const inner = (
      <button
        key={img.name}
        type="button"
        onClick={() => setActive(i)}
        aria-label={note ? `Expand image. ${note}` : "Expand image"}
        className={cn(
          "group relative block w-full cursor-zoom-in overflow-hidden rounded-lg break-inside-avoid",
          className
        )}
      >
        <img
          src={img.src}
          width={img.width}
          height={img.height}
          loading={i < 6 ? "eager" : "lazy"}
          decoding="async"
          className="h-auto w-full"
          alt={note ?? ""}
        />
        {note && (
          <span
            aria-hidden
            className="absolute right-2 top-2 size-2 rounded-full bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
          />
        )}
      </button>
    );
    return note ? (
      <Tooltip key={img.name}>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 text-center">
          {note}
        </TooltipContent>
      </Tooltip>
    ) : (
      inner
    );
  }

  return (
    <>
      <div className="mx-auto mb-6 flex max-w-7xl items-center justify-between px-6">
        <p className="text-sm text-muted-foreground">{images.length} images</p>
        <div
          role="group"
          aria-label="Layout"
          className="flex items-center gap-1 rounded-full border bg-background p-1"
        >
          <button
            aria-label="Grid layout"
            aria-pressed={!list}
            onClick={() => toggle(false)}
            className={cn(
              "rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground",
              !list && "bg-muted text-foreground"
            )}
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            aria-label="List layout"
            aria-pressed={list}
            onClick={() => toggle(true)}
            className={cn(
              "rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground",
              list && "bg-muted text-foreground"
            )}
          >
            <Rows3 className="size-4" />
          </button>
        </div>
      </div>

      {list ? (
        <div className="mx-auto flex max-w-2xl flex-col gap-16 px-6 pb-24">
          {images.map((img, i) => frame(img, i))}
        </div>
      ) : (
        <div className="mx-auto max-w-7xl columns-2 gap-4 px-6 pb-24 [column-fill:_balance] sm:columns-3 lg:columns-4 xl:columns-5">
          {images.map((img, i) => frame(img, i, "mb-4"))}
        </div>
      )}

      {activeImage && (
        <dialog
          ref={dialogRef}
          aria-modal="true"
          aria-label="Expanded image"
          aria-describedby={notes[activeImage.name] ? "image-annotation" : undefined}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onClick={close}
          className="fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none cursor-zoom-out border-0 bg-black/90 px-6 pb-6 pt-20 text-white backdrop:bg-transparent sm:px-10 sm:pb-10"
        >
          <button
            type="button"
            autoFocus
            aria-label="Close expanded image"
            onClick={close}
            className="absolute right-4 top-4 flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-6 sm:top-6"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
          <figure className="mx-auto flex h-full max-w-6xl flex-col items-center justify-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeImage.src}
              width={activeImage.width}
              height={activeImage.height}
              className="min-h-0 max-h-full w-auto max-w-full rounded-lg object-contain"
              alt={notes[activeImage.name] ?? ""}
            />
            {notes[activeImage.name] && (
              <figcaption
                id="image-annotation"
                className="max-h-[30dvh] w-full max-w-2xl shrink-0 overflow-y-auto whitespace-pre-line text-center text-sm leading-relaxed text-white/90"
              >
                {notes[activeImage.name]}
              </figcaption>
            )}
          </figure>
        </dialog>
      )}
    </>
  );
}
