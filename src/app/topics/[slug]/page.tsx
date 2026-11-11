import EntryList from "@/components/entry-list";
import Link from "next/link";
import Glyph from "@/components/glyph";
import { getTopic, getTopicPosts, getTopics, getWikiPages } from "@/data/wiki";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
  const topics = await getTopics();
  return topics.map((topic) => ({ slug: topic.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata | undefined> {
  const topic = await getTopic((await params).slug);
  if (!topic) return;
  return { title: topic.title, description: topic.summary };
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const topic = await getTopic(slug);
  if (!topic) notFound();

  // Wiki pages and posts are one list: curated order first, then anything else tagged with this topic.
  const wiki = (await getWikiPages())
    .filter((p) => p.topics.includes(slug))
    .map((p) => ({
      slug: p.slug,
      href: `/wiki/${p.slug}`,
      title: p.title,
      summary: p.summary,
      glyph: p.glyph,
    }));
  const posts = getTopicPosts(slug).map((p) => ({
    ...p,
    href: `/blog/${p.slug}`,
  }));
  const rank = (s: string) => {
    const i = topic.pages.indexOf(s);
    return i === -1 ? Infinity : i;
  };
  const entries = [...wiki, ...posts].sort(
    (a, b) => rank(a.slug) - rank(b.slug),
  );
  // Anything with a glyph goes on top, drawn like the home page rows
  const glyphed = entries.filter((e) => e.glyph);
  const rest = entries.filter((e) => !e.glyph);

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-12 sm:px-6 sm:pt-16">
      <div className="max-w-2xl">
        <header className="mb-14">
          <div className="flex items-center gap-5">
            {topic.glyph && (
              <Glyph
                kind={topic.glyph}
                className="h-[60px] w-24 flex-none rounded-[3px] border border-border bg-background"
              />
            )}
            <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-5xl">
              {topic.title}
            </h1>
          </div>
          <div
            className="prose article-prose mt-6 text-muted-foreground dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: topic.introHtml }}
          />
        </header>

        {entries.length > 0 && (
          <section aria-labelledby="pages-heading">
            <h2
              id="pages-heading"
              className="border-b border-border pb-3 text-sm font-medium"
            >
              Notes
            </h2>
            {glyphed.length > 0 && (
              <ul className="divide-y divide-border border-b border-border">
                {glyphed.map((e) => (
                  <li key={e.href}>
                    <Link
                      href={e.href}
                      className="group flex items-center gap-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <Glyph
                        kind={e.glyph!}
                        className="h-10 w-16 flex-none rounded-[3px] border border-border bg-background"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium tracking-tight underline-offset-4 group-hover:underline">
                          {e.title}
                        </span>
                        {e.summary && (
                          <span className="block truncate text-sm text-muted-foreground">
                            {e.summary}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <EntryList
              entries={rest.map(({ href, title, summary }) => ({
                href,
                title,
                summary,
              }))}
            />
          </section>
        )}
      </div>
    </main>
  );
}
