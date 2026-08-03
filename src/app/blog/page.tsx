import { getBlogStream, type BlogStreamItem } from "@/data/blog";
import Link from "next/link";

export const metadata = {
  title: "Blog",
  description: "Writing, notes, and the occasional stray thought.",
};

function formatAbsolute(date: string) {
  if (!date) return "";
  const value = date.includes("T") ? date : `${date}T00:00:00`;
  return new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const byDateDesc = (a: BlogStreamItem, b: BlogStreamItem) =>
  new Date(b.date).getTime() - new Date(a.date).getTime();

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-4 mb-6">
      <span className="text-sm text-muted-foreground tracking-wide">
        {children}
      </span>
      <span className="h-px flex-1 bg-border" />
    </h2>
  );
}

export default async function BlogPage() {
  const items = await getBlogStream();
  const posts = items.filter((i) => i.type === "post").sort(byDateDesc);
  const notes = items.filter((i) => i.type === "thought").sort(byDateDesc);

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="font-medium text-2xl mb-8 tracking-tighter">blog</h1>

      {posts.length > 0 && (
        <section className="mb-14">
          <SectionLabel>writing</SectionLabel>
          {posts.map((item) => (
            <Link
              key={`post-${item.slug}`}
              className="flex flex-col space-y-1 mb-6"
              href={`/blog/${item.slug}`}
            >
              <p className="tracking-tight">{item.title}</p>
              {item.summary && (
                <p className="text-sm text-muted-foreground">{item.summary}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {formatAbsolute(item.date)}
              </p>
            </Link>
          ))}
        </section>
      )}

      {notes.length > 0 && (
        <section>
          <SectionLabel>notes</SectionLabel>
          {notes.map((item) => (
            <article key={`thought-${item.slug}`} className="mb-10">
              <p className="text-xs text-muted-foreground mb-2">
                {formatAbsolute(item.date)}
              </p>
              <div
                className="prose dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: item.bodyHtml ?? "" }}
              />
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
