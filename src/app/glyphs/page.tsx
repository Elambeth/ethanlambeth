import Glyph, { type GlyphKind } from "@/components/glyph";

export const metadata = {
  title: "Glyphs",
  robots: { index: false, follow: false },
};

// Candidate home-page glyphs, side by side (the first of each pair is the one in use)
const sets: { essay: string; kinds: GlyphKind[] }[] = [
  { essay: "Gesture inputs", kinds: ["wheel", "pinch"] },
  { essay: "A live ad-blocker", kinds: ["lens", "sweep"] },
  { essay: "How to explain things", kinds: ["build", "stack"] },
  { essay: "Useful computer things", kinds: ["panes", "tabs"] },
];

export default function GlyphsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-8 text-3xl font-bold">Glyphs</h1>
      <ul className="divide-y divide-border">
        {sets.map((set) => (
          <li key={set.essay} className="py-5">
            <p className="mb-3 font-medium tracking-tight">{set.essay}</p>
            <div className="flex flex-wrap gap-6">
              {set.kinds.map((kind) => (
                <figure key={kind} className="flex flex-col items-center gap-2">
                  <Glyph
                    kind={kind}
                    className="h-10 w-16 rounded-[3px] border border-border bg-background"
                  />
                  <Glyph
                    kind={kind}
                    className="h-[120px] w-48 rounded-[3px] border border-border bg-background"
                  />
                  <figcaption className="font-mono text-xs text-muted-foreground">{kind}</figcaption>
                </figure>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
