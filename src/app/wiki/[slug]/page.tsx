import EntryList from "@/components/entry-list";
import { getTopics, getWikiPage, getWikiPages } from "@/data/wiki";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
  const pages = await getWikiPages();
  return pages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata | undefined> {
  const page = await getWikiPage((await params).slug);
  if (!page) return;
  return { title: page.title, description: page.summary };
}

export default async function WikiPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [pages, allTopics] = await Promise.all([getWikiPages(), getTopics()]);
  const page = pages.find((p) => p.slug === slug);
  if (!page) notFound();

  const topics = allTopics.filter((t) => page.topics.includes(t.slug));
  const backlinks = pages.filter((p) => p.slug !== slug && p.links.includes(slug));

  // Next page in the reading order of this page's first topic.
  const order = topics[0]?.pages ?? [];
  const nextSlug = order[order.indexOf(slug) + 1];
  const next = order.includes(slug) ? pages.find((p) => p.slug === nextSlug) : undefined;

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-12 sm:px-6 sm:pt-16">
      <div className="max-w-2xl">
        <header className="mb-6 border-b border-border pb-6">
          <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-5xl">
            {page.title}
          </h1>
          {topics.length > 0 && (
            <nav aria-label="Topics" className="mt-4 flex flex-wrap gap-x-3 gap-y-2 text-sm text-muted-foreground">
              {topics.map((topic) => (
                <Link
                  key={topic.slug}
                  href={`/topics/${topic.slug}`}
                  className="link-underline rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {topic.title}
                </Link>
              ))}
            </nav>
          )}
          {page.summary && (
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">{page.summary}</p>
          )}
        </header>
        <article
          className="prose article-prose dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: page.html }}
        />

        {backlinks.length > 0 && (
          <section className="mt-16 rounded-lg bg-zinc-100 px-5 dark:bg-zinc-900 pt-4 [&_a:last-child]:border-b-0" aria-labelledby="backlinks-heading">
            <h2 id="backlinks-heading" className="border-b border-border pb-3 text-sm font-medium">
              Linked from
            </h2>
            <EntryList
              entries={backlinks.map((p) => ({ href: `/wiki/${p.slug}`, title: p.title, summary: p.summary }))}
            />
          </section>
        )}

        {next && (
          <footer className="mt-16 border-t border-border pt-6 text-sm">
            <Link
              href={`/wiki/${next.slug}`}
              className="link-underline rounded-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Next: {next.title}
            </Link>
          </footer>
        )}
      </div>
    </main>
  );
}
