"use client";

import { useCallback, useEffect, useState } from "react";
import { LayoutGrid, Rows3 } from "lucide-react";
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

  const close = useCallback(() => setActive(null), []);

  useEffect(() => {
    if (active === null) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
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
          {images.map((img, i) => frame(img, i))}
        </div>
      )}

      {activeImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Expanded image"
          onClick={close}
          className="fixed inset-0 z-[60] flex cursor-zoom-out items-center justify-center bg-black/85 p-6 sm:p-10"
        >
          <div
            className="flex max-h-full max-w-full flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeImage.src}
              width={activeImage.width}
              height={activeImage.height}
              className="max-h-[85vh] w-auto max-w-full rounded-lg object-contain sm:max-w-[min(70vw,100%)]"
              alt={notes[activeImage.name] ?? ""}
            />
            {notes[activeImage.name] && (
              <p className="max-w-64 shrink-0 text-sm leading-relaxed text-white/80 sm:text-inherit">
                {notes[activeImage.name]}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
