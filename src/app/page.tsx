import Link from "next/link";
import Glyph, { type GlyphKind } from "@/components/glyph";

const beliefs = [
  'Voice is not "the next interface".',
  "AI safety an extremely important problem",
];

const things: { title: string; summary: string; glyph: GlyphKind; href?: string }[] = [
  {
    title: "Panacea Index",
    summary: "Fact checking health influencers.",
    glyph: "eye",
    href: "https://panaceaindex.com",
  },
  {
    title: "Keyboard layout",
    summary: "The layers of my split keyboard.",
    glyph: "typing",
    href: "/blog/keyboard-layout",
  },
  {
    title: "Interfaces",
    summary: "Interfaces, broadly.",
    glyph: "dock",
    href: "/topics/interfaces",
  },
  {
    title: "Augmented reality",
    summary: "What an AR world would look like, and the social norms that form.",
    glyph: "brackets",
    href: "/topics/ar",
  },
  {
    title: "Agent swarms",
    summary: "What conflict between large swarms of agents could look like.",
    glyph: "takeover",
  },
];

function ThingRow({ thing }: { thing: (typeof things)[number] }) {
  const body = (
    <>
      <Glyph
        kind={thing.glyph}
        className="h-10 w-16 flex-none rounded-[3px] border border-border bg-background"
      />
      <span className="min-w-0">
        <span className="block font-medium tracking-tight">{thing.title}</span>
        <span className="block truncate text-sm text-muted-foreground">
          {thing.summary}
        </span>
      </span>
    </>
  );
  const row = "flex items-center gap-4 py-3";
  if (!thing.href) return <div className={row}>{body}</div>;
  const linked = `${row} group outline-none focus-visible:ring-2 focus-visible:ring-ring [&_.font-medium]:group-hover:underline [&_.font-medium]:underline-offset-4`;
  return thing.href.startsWith("http") ? (
    <a href={thing.href} className={linked}>
      {body}
    </a>
  ) : (
    <Link href={thing.href} className={linked}>
      {body}
    </Link>
  );
}

export default function Page() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-8 text-3xl font-bold">Ethan Lambeth</h1>

      <section aria-labelledby="things-heading">
        <h2
          id="things-heading"
          className="border-b border-border pb-3 text-base font-semibold"
        >
          Things I am working on:
        </h2>
        <ul className="mt-2 divide-y divide-border">
          {things.map((thing) => (
            <li key={thing.title}>
              <ThingRow thing={thing} />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16" aria-labelledby="beliefs-heading">
        <h2
          id="beliefs-heading"
          className="border-b border-border pb-3 text-base font-semibold"
        >
          Beliefs I currently have:
        </h2>
        <ul className="mt-5 list-disc space-y-2.5 pl-5 text-[0.95rem] leading-7 marker:text-muted-foreground">
          {beliefs.map((belief) => (
            <li key={belief}>{belief}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
