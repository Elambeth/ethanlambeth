"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";

type Image = {
  name: string;
  src: string;
  width: number;
  height: number;
};

const STORAGE_KEY = "input-gestures.view";

export default function Viewer({ images }: { images: Image[] }) {
  const [list, setList] = useState(false);

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
          {images.map((img, i) => (
            <img
              key={img.name}
              src={img.src}
              width={img.width}
              height={img.height}
              loading={i < 2 ? "eager" : "lazy"}
              decoding="async"
              className="h-auto w-full rounded-lg"
              alt=""
            />
          ))}
        </div>
      ) : (
        <div className="mx-auto max-w-7xl columns-2 gap-4 px-6 pb-24 [column-fill:_balance] sm:columns-3 lg:columns-4 xl:columns-5">
          {images.map((img, i) => (
            <img
              key={img.name}
              src={img.src}
              width={img.width}
              height={img.height}
              loading={i < 6 ? "eager" : "lazy"}
              decoding="async"
              className="mb-4 h-auto w-full break-inside-avoid rounded-lg"
              alt=""
            />
          ))}
        </div>
      )}
    </>
  );
}
