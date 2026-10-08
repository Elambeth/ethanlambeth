import Link from "next/link";

type Entry = { href: string; title: string; summary?: string };

/** The one-line title + summary rows used on /blog, topics and the wiki. */
export default function EntryList({ entries }: { entries: Entry[] }) {
  return (
    <div>
      {entries.map((entry) => (
        <Link
          key={entry.href}
          href={entry.href}
          className="group flex items-baseline gap-3 border-b border-border py-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <h3 className="shrink-0 whitespace-nowrap font-semibold group-hover:underline group-hover:decoration-border group-hover:underline-offset-4">
            {entry.title}
          </h3>
          {entry.summary && <p className="min-w-0 truncate text-muted-foreground">{entry.summary}</p>}
        </Link>
      ))}
    </div>
  );
}
