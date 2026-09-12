"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import ImageCarousel, { type CarouselImage } from "@/components/image-carousel";

export type BlogReaderEntry = {
  id: string;
  kind: "post" | "note";
  title: string;
  dateLabel: string;
  shortDate: string;
  summary?: string;
  gallery?: CarouselImage[];
  html: string;
};

function SidebarLink({
  entry,
  active,
  onSelect,
}: {
  entry: BlogReaderEntry;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.id)}
      aria-pressed={active}
      className={cn(
        "relative w-full py-2 pl-4 text-left",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1 bottom-1 w-px bg-foreground" />
      )}
      <span className="block truncate text-sm font-medium tracking-tight">
        {entry.title}
      </span>
    </button>
  );
}

export default function BlogReader({ entries }: { entries: BlogReaderEntry[] }) {
  const [activeId, setActiveId] = useState(entries[0]?.id ?? "");
  const chipRowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const activeEntry = entries.find((entry) => entry.id === activeId) ?? entries[0];

  // Keep the active mobile chip centered in its scrollable row.
  useEffect(() => {
    const row = chipRowRef.current;
    if (!row) return;
    const chip = row.querySelector<HTMLElement>(`[data-chip="${activeId}"]`);
    if (!chip) return;
    const target = chip.offsetLeft - (row.clientWidth - chip.clientWidth) / 2;
    row.scrollTo({ left: target, behavior: "auto" });
  }, [activeId]);

  const selectEntry = useCallback(
    (id: string) => {
      setActiveId(id);
      requestAnimationFrame(() => {
        contentRef.current?.scrollIntoView({
          behavior: "auto",
          block: "start",
        });
      });
    },
    []
  );

  if (!activeEntry) return null;

  return (
    <div>
      {/* Mobile: horizontal chip row instead of the sidebar */}
      <div className="xl:hidden mb-10 overflow-x-auto" ref={chipRowRef}>
        <div className="flex gap-2 w-max px-0.5">
          {entries.map((entry) => {
            const active = entry.id === activeId;
            return (
              <button
                key={entry.id}
                type="button"
                data-chip={entry.id}
                onClick={() => selectEntry(entry.id)}
                aria-pressed={active}
                className={cn(
                  "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {entry.title}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative">
        {/* Desktop: sticky index of all writing */}
        <aside className="absolute inset-y-0 -left-6 z-10 hidden w-56 xl:block">
          <div className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto pb-4">
            <nav>
              {entries.map((entry) => (
                <SidebarLink
                  key={entry.id}
                  entry={entry}
                  active={entry.id === activeId}
                  onSelect={selectEntry}
                />
              ))}
            </nav>
          </div>
        </aside>

        {/* Main column: only the selected entry is rendered. */}
        <div ref={contentRef} className="mx-auto min-w-0 max-w-2xl scroll-mt-16">
          <section
            key={activeEntry.id}
            id={activeEntry.id}
          >
            {activeEntry.kind === "post" ? (
              <>
                <h2 className="font-medium text-2xl tracking-tighter">
                  {activeEntry.title}
                </h2>
                <p className="text-xs text-muted-foreground mt-2 mb-6">
                  {activeEntry.dateLabel}
                </p>
                {activeEntry.summary && (
                  <p className="text-sm text-muted-foreground mb-6">
                    {activeEntry.summary}
                  </p>
                )}
                {activeEntry.gallery && (
                  <ImageCarousel images={activeEntry.gallery} />
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground mb-2">
                {activeEntry.dateLabel}
              </p>
            )}
            <div
              className="prose dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: activeEntry.html }}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
