"use client";

import BlogReader, { type BlogReaderEntry } from "@/components/blog-reader";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type PlaygroundFont = {
  id: string;
  label: string;
  cssVar: string;
  note?: string;
};

export default function FontPlayground({
  entries,
  fonts,
}: {
  entries: BlogReaderEntry[];
  fonts: PlaygroundFont[];
}) {
  const [selected, setSelected] = useState(fonts[0].id);
  const active = fonts.find((f) => f.id === selected) ?? fonts[0];

  return (
    <div style={{ fontFamily: active.cssVar }} className="pb-28">
      <main className="max-w-6xl mx-auto px-6 py-12">
        <h1 className="font-medium text-2xl mb-2 tracking-tighter">
          font playground
        </h1>
        <p className="text-xs text-muted-foreground mb-8">
          Same page as /blog — switch the reading font below.
        </p>
        <BlogReader entries={entries} />
      </main>

      {/* Sticky bottom switcher */}
      <div className="fixed bottom-0 inset-x-0 z-50 border-t bg-background/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-2 whitespace-nowrap">
            {active.label}
            {active.note && (
              <span className="text-muted-foreground/70"> · {active.note}</span>
            )}
          </span>
          {fonts.map((font) => (
            <button
              key={font.id}
              type="button"
              onClick={() => setSelected(font.id)}
              style={{ fontFamily: font.cssVar }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                font.id === selected
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {font.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
